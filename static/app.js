// ScanTable Web Annotator - JS principale

const imageInput = document.getElementById('imageInput');
const projectNameInput = document.getElementById('projectName');
const processBtn = document.getElementById('processBtn');
const statusSpan = document.getElementById('status');
const tableCanvas = document.getElementById('tableCanvas');
const cellIdInput = document.getElementById('cellId');
const cellContentTextarea = document.getElementById('cellContent');
const cellTypeSelect = document.getElementById('cellType');
const saveCellBtn = document.getElementById('saveCellBtn');
const projectInput = document.getElementById('projectInput');
const loadProjBtn = document.getElementById('loadProjBtn');
let originalFilename = '';

let loadedImage = null;
let cellsData = [];
let selectedCellIndex = null;
let projectName = '';

imageInput.addEventListener('change', () => {
    processBtn.disabled = !(imageInput.files.length > 0 && projectNameInput.value.trim() !== '');
});

projectNameInput.addEventListener('input', () => {
    processBtn.disabled = !(imageInput.files.length > 0 && projectNameInput.value.trim() !== '');
});

processBtn.addEventListener('click', () => {
    if (!imageInput.files.length || !projectNameInput.value.trim()) return;
    statusSpan.textContent = 'Elaborazione in corso...';
    processBtn.disabled = true;
    projectName = projectNameInput.value.trim();
    uploadAndProcessImage(imageInput.files[0], projectName);
});

function uploadAndProcessImage(file, projectName) {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('project_name', projectName);
    fetch('/api/process', {
        method: 'POST',
        body: formData
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            statusSpan.textContent = 'Errore: ' + data.error;
            processBtn.disabled = false;
            return;
        }
        cellsData = data.cells || [];
        originalFilename = data.original_filename;
        statusSpan.textContent = 'Elaborazione completata. Seleziona una cella.';
        drawTable();
    })
    .catch(err => {
        statusSpan.textContent = 'Errore durante l\'elaborazione.';
        processBtn.disabled = false;
    });
}

function drawTable() {
    const ctx = tableCanvas.getContext('2d');
    // canvas dimensioni uguali all'immagine
    if (loadedImage) {
        tableCanvas.width = loadedImage.width;
        tableCanvas.height = loadedImage.height;
        ctx.drawImage(loadedImage, 0, 0);
    } else {
        tableCanvas.width = 800;
        tableCanvas.height = 600;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, tableCanvas.width, tableCanvas.height);
    }
    // poi traccia i rettangoli delle celle
    cellsData.forEach((cell, idx) => {
        const [x, y, w, h] = cell.coords;
        ctx.strokeStyle = (idx === selectedCellIndex) ? '#1976d2' : '#388e3c';
        ctx.lineWidth = (idx === selectedCellIndex) ? 3 : 1.5;
        ctx.strokeRect(x, y, w, h);
        ctx.font = '12px Arial';
        ctx.fillStyle = '#333';
        ctx.fillText(cell.id, x + 4, y + 16);
    });
}

tableCanvas.addEventListener('click', (e) => {
    const rect = tableCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let found = false;
    cellsData.forEach((cell, idx) => {
        const [cx, cy, cw, ch] = cell.coords;
        if (x >= cx && x <= cx + cw && y >= cy && y <= cy + ch) {
            selectCell(idx);
            found = true;
        }
    });
    if (!found) {
        clearDetailsPanel();
    }
});

function selectCell(idx) {
    selectedCellIndex = idx;
    const cell = cellsData[idx];
    cellIdInput.value = cell.id;
    cellContentTextarea.value = cell.text || '';
    cellTypeSelect.value = cell.type || 'standard';
    saveCellBtn.disabled = false;
    drawTable();
}

function clearDetailsPanel() {
    selectedCellIndex = null;
    cellIdInput.value = '';
    cellContentTextarea.value = '';
    cellTypeSelect.value = 'standard';
    saveCellBtn.disabled = true;
    drawTable();
}

saveCellBtn.addEventListener('click', () => {
    if (selectedCellIndex === null) return;
    cellsData[selectedCellIndex].text = cellContentTextarea.value;
    cellsData[selectedCellIndex].type = cellTypeSelect.value;
    // Salva lato server (opzionale)
    saveAnnotations();
});

function saveAnnotations() {
    fetch('/api/annotations', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            project_name: projectName,
            annotations: cellsData.map(cell => ({id: cell.id, text: cell.text, type: cell.type}))
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            statusSpan.textContent = 'Annotazioni salvate.';
        } else {
            statusSpan.textContent = 'Errore nel salvataggio annotazioni.';
        }
    })
    .catch(() => {
        statusSpan.textContent = 'Errore di rete nel salvataggio.';
    });
}

// Abilita il pulsante se carico un file
projectInput.addEventListener('change', () => {
    loadProjBtn.disabled = projectInput.files.length === 0;
});

// caricamento progetto
loadProjBtn.addEventListener('click', () => {
    if (!projectInput.files.length) return;
    statusSpan.textContent = 'Caricamento progetto…';
    const fd = new FormData();
    fd.append('project', projectInput.files[0]);
    fetch('/api/load_project', { method: 'POST', body: fd })
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          statusSpan.textContent = data.error;
          return;
        }
        projectName = data.project_name;
        cellsData = data.cells;
        // crea oggetto Image da Base64
        loadedImage = new Image();
        loadedImage.onload = () => {
          drawTable();
          statusSpan.textContent = `Progetto "${projectName}" caricato.`;
        };
        loadedImage.src = data.image_data;         // usa il data-URL
      })
      .catch(() => statusSpan.textContent = 'Errore caricamento.');
});

function saveAnnotations() {
    fetch('/api/annotations', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            project_name: projectName,
            original_filename: originalFilename,
            annotations: cellsData.map(cell => ({
                id: cell.id,
                coords: cell.coords,
                text: cell.text,
                type: cell.type
            }))
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            statusSpan.textContent = 'Annotazioni salvate sul server.';
        } else {
            statusSpan.textContent = 'Errore nel salvataggio: ' + (data.error||'');
        }
    })
    .catch(() => {
        statusSpan.textContent = 'Errore di rete nel salvataggio.';
    });
}
