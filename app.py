import os
import io
import json
import base64
import zipfile

from flask import Flask, request, jsonify, render_template
from werkzeug.utils import secure_filename

import cv2
import numpy as np
import easyocr

app = Flask(__name__)

# Cartella dove salviamo i .tblproj
PROJECTS_FOLDER = 'progetti'
os.makedirs(PROJECTS_FOLDER, exist_ok=True)

# Inizializza EasyOCR
ocr_reader = easyocr.Reader(['it','en'], gpu=False)

# --- UTILITY FUNCTIONS PER TABLE PROCESSING ---
def order_points(pts):
    rect = np.zeros((4,2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect

def four_point_transform(image, pts):
    rect = order_points(pts)
    (tl, tr, br, bl) = rect
    widthA = np.linalg.norm(br - bl)
    widthB = np.linalg.norm(tr - tl)
    maxWidth = max(int(widthA), int(widthB))
    heightA = np.linalg.norm(tr - br)
    heightB = np.linalg.norm(tl - bl)
    maxHeight = max(int(heightA), int(heightB))
    dst = np.array([
        [0, 0],
        [maxWidth - 1, 0],
        [maxWidth - 1, maxHeight - 1],
        [0, maxHeight - 1]
    ], dtype="float32")
    M = cv2.getPerspectiveTransform(rect, dst)
    warped = cv2.warpPerspective(image, M, (maxWidth, maxHeight), flags=cv2.INTER_CUBIC)
    return warped

def sort_contours(cnts, method="top-to-bottom"):
    boundingBoxes = [cv2.boundingRect(c) for c in cnts]
    if not cnts:
        return [], []
    cnts_boxes = sorted(zip(cnts, boundingBoxes), key=lambda b: b[1][1])
    cnts, boundingBoxes = zip(*cnts_boxes)
    return cnts, boundingBoxes

def is_valid_box(w, h):
    if w < 15 or h < 10:
        return False
    aspect_ratio = max(w/h, h/w) if h and w else float('inf')
    return aspect_ratio < 25

# --- ROUTES ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/process', methods=['POST'])
def process_image():
    # 1) Nome progetto
    project_name = request.form.get('project_name')
    if not project_name:
        return jsonify({'error': 'Nome progetto mancante'}), 400

    # 2) Leggi immagine dal form in memoria
    file = request.files.get('image')
    if not file or file.filename == '':
        return jsonify({'error': 'Immagine mancante'}), 400
    ext = secure_filename(file.filename).rsplit('.', 1)[-1].lower()
    img_bytes = file.read()
    np_arr = np.frombuffer(img_bytes, dtype=np.uint8)
    img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if img is None:
        return jsonify({'error': 'Impossibile decodificare immagine'}), 400

    # 3) Elaborazione: prospettiva, binarizzazione, rilevazione celle, OCR...
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5,5), 0)
    th_persp = cv2.adaptiveThreshold(blur, 255,
                                     cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                     cv2.THRESH_BINARY_INV, 15, 4)
    edges = cv2.Canny(th_persp, 50, 150, apertureSize=3)
    cnts_persp, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    cnts_persp = sorted(cnts_persp, key=cv2.contourArea, reverse=True)

    tableCnt = None
    for c in cnts_persp:
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.02 * peri, True)
        if len(approx) == 4:
            tableCnt = approx.reshape(4,2)
            break

    if tableCnt is None:
        warped = img.copy()
        gray_warped = gray.copy()
    else:
        warped = four_point_transform(img, tableCnt)
        gray_warped = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)

    th_bin = cv2.adaptiveThreshold(gray_warped, 255,
                                   cv2.ADAPTIVE_THRESH_MEAN_C,
                                   cv2.THRESH_BINARY_INV, 15, 10)
    h_kern = cv2.getStructuringElement(cv2.MORPH_RECT, (40,1))
    hor = cv2.morphologyEx(th_bin, cv2.MORPH_OPEN, h_kern)
    v_kern = cv2.getStructuringElement(cv2.MORPH_RECT, (1,40))
    ver = cv2.morphologyEx(th_bin, cv2.MORPH_OPEN, v_kern)
    grid = cv2.add(hor, ver)

    cnts_cells, _ = cv2.findContours(grid, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    cnts_cells, boxes = sort_contours(cnts_cells, "top-to-bottom")

    valid_boxes = [b for b in boxes if is_valid_box(b[2], b[3])]
    cells_data = []
    for i, (x, y, w, h) in enumerate(valid_boxes[1:] if len(valid_boxes)>1 else []):
        cell_gray = gray_warped[y:y+h, x:x+w]
        _, cell_th = cv2.threshold(cell_gray, 0, 255,
                                   cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        try:
            result = ocr_reader.readtext(cell_th, detail=0, paragraph=True)
            text = " ".join(result)
        except:
            text = ""
        cells_data.append({
            'id': f'cell_{i}',
            'coords': [int(x), int(y), int(w), int(h)],
            'text': text,
            'type': 'standard'
        })

    # Converti l'immagine elaborata in bytes
    _, processed_img_bytes = cv2.imencode(f'.{ext}', warped)
    processed_img_bytes = processed_img_bytes.tobytes()

    # 4) Salva .tblproj (ZIP) in progetti/
    metadata = {'project_name': project_name, 'cells': cells_data}
    mem_zip = io.BytesIO()
    with zipfile.ZipFile(mem_zip, 'w') as zf:
        zf.writestr(f'image_original.{ext}', img_bytes)
        zf.writestr(f'image_processed.{ext}', processed_img_bytes)
        zf.writestr('metadata.json',
                    json.dumps(metadata, ensure_ascii=False, indent=2))
    mem_zip.seek(0)

    proj_path = os.path.join(PROJECTS_FOLDER, f'{project_name}.tblproj')
    with open(proj_path, 'wb') as f:
        f.write(mem_zip.getvalue())

    # Converti l'immagine elaborata in base64 per il client
    b64 = base64.b64encode(processed_img_bytes).decode('utf-8')
    data_url = f'data:image/{ext};base64,{b64}'

    # 5) Rispondi al client
    return jsonify({
        'project_name': project_name,
        'cells': cells_data,
        'image_data': data_url,
        'original_filename': file.filename
    })


@app.route('/api/load_project', methods=['POST'])
def load_project():
    proj_file = request.files.get('project')
    if not proj_file:
        return jsonify({'error': 'Nessun file inviato'}), 400

    mem = io.BytesIO(proj_file.read())
    try:
        with zipfile.ZipFile(mem) as zf:
            meta = json.loads(zf.read('metadata.json'))
            # Cerca prima l'immagine elaborata, se non c'è usa l'originale
            file_list = zf.namelist()
            processed_img_name = next((n for n in file_list if n.startswith('image_processed.')), None)

            if processed_img_name:
                img_bytes = zf.read(processed_img_name)
                ext = processed_img_name.rsplit('.',1)[1]
            else:
                # Compatibilità con vecchi progetti
                img_name = next((n for n in file_list if n.startswith('image_original.') or n.startswith('image.')), None)
                if not img_name:
                    return jsonify({'error': 'Immagine mancante nel progetto'}), 400
                img_bytes = zf.read(img_name)
                ext = img_name.rsplit('.',1)[1]
    except Exception as e:
        return jsonify({'error': 'ZIP non valido o metadata mancante'}), 400

    # Base64-encode per il client
    mime = f'image/{ext}'
    b64 = base64.b64encode(img_bytes).decode('utf-8')
    data_url = f'data:{mime};base64,{b64}'

    return jsonify({
        'project_name': meta.get('project_name', ''),
        'cells': meta.get('cells', []),
        'image_data': data_url
    })


@app.route('/api/annotations', methods=['POST'])
def save_annotations():
    data = request.get_json()
    project_name = data.get('project_name')
    annotations = data.get('annotations')

    proj_path = os.path.join(PROJECTS_FOLDER, f'{project_name}.tblproj')
    if not os.path.exists(proj_path):
        return jsonify({'success': False, 'error': 'Progetto non trovato'}), 404

    # Riapri ZIP, conserva immagine, aggiorna solo metadata
    with zipfile.ZipFile(proj_path, 'r') as zf:
        img_name = next(n for n in zf.namelist() if n.startswith('image.'))
        img_bytes = zf.read(img_name)

    metadata = {'project_name': project_name, 'cells': annotations}
    mem_zip = io.BytesIO()
    with zipfile.ZipFile(mem_zip, 'w') as zf:
        zf.writestr(img_name, img_bytes)
        zf.writestr('metadata.json',
                    json.dumps(metadata, ensure_ascii=False, indent=2))
    with open(proj_path, 'wb') as f:
        f.write(mem_zip.getvalue())

    return jsonify({'success': True})


if __name__ == '__main__':
    app.run(debug=True)
