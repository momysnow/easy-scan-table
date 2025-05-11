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
const resetViewBtn = document.getElementById('resetViewBtn');
let originalFilename = '';

let loadedImage = null;
let cellsData = [];
let selectedCellIndex = null;
let projectName = '';

// Variabili per zoom e pan
let scale = 1;
let translateX = 0;
let translateY = 0;
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

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

        // Carica l'immagine elaborata
        if (data.image_data) {
            loadedImage = new Image();
            loadedImage.onload = () => {
                // Reset zoom e pan
                resetView();
                drawTable();
                statusSpan.textContent = 'Elaborazione completata. Seleziona una cella.';
            };
            loadedImage.src = data.image_data;
        } else {
            statusSpan.textContent = 'Elaborazione completata, ma nessuna immagine ricevuta.';
            drawTable();
        }
    })
    .catch(err => {
        statusSpan.textContent = 'Errore durante l\'elaborazione.';
        processBtn.disabled = false;
    });
}

function drawTable() {
    const ctx = tableCanvas.getContext('2d');

    // Imposta le dimensioni del canvas in base all'immagine
    if (loadedImage) {
        // Manteniamo le dimensioni del canvas fisse per il viewport
        // ma impostiamo l'area di disegno in base all'immagine
        const canvasWidth = tableCanvas.clientWidth;
        const canvasHeight = tableCanvas.clientHeight;

        // Assicuriamoci che il canvas abbia le dimensioni corrette per il rendering
        if (tableCanvas.width !== canvasWidth || tableCanvas.height !== canvasHeight) {
            tableCanvas.width = canvasWidth;
            tableCanvas.height = canvasHeight;
        }

        // Pulisci il canvas
        ctx.fillStyle = '#e0e0e0';
        ctx.fillRect(0, 0, tableCanvas.width, tableCanvas.height);

        // Applica trasformazioni per zoom e pan
        ctx.save();
        ctx.translate(translateX, translateY);
        ctx.scale(scale, scale);

        // Disegna l'immagine
        ctx.drawImage(loadedImage, 0, 0);

        // Disegna i rettangoli delle celle
        cellsData.forEach((cell, idx) => {
            const [x, y, w, h] = cell.coords;
            ctx.strokeStyle = (idx === selectedCellIndex) ? '#1976d2' : '#388e3c';
            ctx.lineWidth = (idx === selectedCellIndex) ? 3/scale : 1.5/scale;
            ctx.strokeRect(x, y, w, h);

            // Adatta la dimensione del font allo zoom
            ctx.font = `${12/scale}px Arial`;
            ctx.fillStyle = '#333';
            ctx.fillText(cell.id, x + 4, y + 16);
        });

        ctx.restore();
    } else {
        // Se non c'è immagine, mostra un canvas vuoto
        tableCanvas.width = 800;
        tableCanvas.height = 600;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, tableCanvas.width, tableCanvas.height);
    }
}

// Funzione per resettare zoom e pan
function resetView() {
    scale = 1;
    translateX = 0;
    translateY = 0;
}

tableCanvas.addEventListener('click', (e) => {
    // Ignora il click se stiamo trascinando
    if (isDragging) return;

    const rect = tableCanvas.getBoundingClientRect();
    // Converti le coordinate del mouse in coordinate del canvas tenendo conto di zoom e pan
    const mouseX = (e.clientX - rect.left - translateX) / scale;
    const mouseY = (e.clientY - rect.top - translateY) / scale;

    let found = false;
    cellsData.forEach((cell, idx) => {
        const [cx, cy, cw, ch] = cell.coords;
        if (mouseX >= cx && mouseX <= cx + cw && mouseY >= cy && mouseY <= cy + ch) {
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
          // Reset zoom e pan
          resetView();
          drawTable();
          statusSpan.textContent = `Progetto "${projectName}" caricato.`;
        };
        loadedImage.src = data.image_data;         // usa il data-URL
      })
      .catch(() => statusSpan.textContent = 'Errore caricamento.');
});

// Gestione zoom con rotellina del mouse
tableCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();

    if (!loadedImage) return;

    const rect = tableCanvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Calcola il punto sotto il mouse in coordinate del canvas
    const pointX = (mouseX - translateX) / scale;
    const pointY = (mouseY - translateY) / scale;

    // Modifica lo zoom
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    scale *= zoomFactor;

    // Limita lo zoom
    scale = Math.min(Math.max(0.1, scale), 10);

    // Aggiorna la traslazione per mantenere il punto sotto il mouse
    translateX = mouseX - pointX * scale;
    translateY = mouseY - pointY * scale;

    drawTable();
});

// Gestione pan con trascinamento del mouse
tableCanvas.addEventListener('mousedown', (e) => {
    if (!loadedImage) return;

    isDragging = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    tableCanvas.style.cursor = 'grabbing';
});

window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const deltaX = e.clientX - lastMouseX;
    const deltaY = e.clientY - lastMouseY;

    translateX += deltaX;
    translateY += deltaY;

    lastMouseX = e.clientX;
    lastMouseY = e.clientY;

    drawTable();
});

window.addEventListener('mouseup', () => {
    if (isDragging) {
        isDragging = false;
        tableCanvas.style.cursor = 'default';
    }
});

// Doppio click per resettare la vista
tableCanvas.addEventListener('dblclick', () => {
    if (!loadedImage) return;
    resetView();
    drawTable();
});

// Pulsante per resettare la vista
resetViewBtn.addEventListener('click', () => {
    if (!loadedImage) return;
    resetView();
    drawTable();
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
