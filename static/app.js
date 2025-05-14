// ScanTable Web Annotator - JS principale

// Elementi DOM
const imageInput = document.getElementById('imageInput');
const projectNameInput = document.getElementById('projectName');
const projectNameDisplay = document.getElementById('projectNameDisplay');
const processBtn = document.getElementById('processBtn');
const statusSpan = document.getElementById('status');
const tableCanvas = document.getElementById('tableCanvas');
const cellIdInput = document.getElementById('cellId');
const cellContentTextarea = document.getElementById('cellContent');
const cellTypeSelect = document.getElementById('cellType');
const saveCellBtn = document.getElementById('saveCellBtn');
const projectInput = document.getElementById('projectInput');
const masterInput = document.getElementById('masterInput');
const resetViewBtn = document.getElementById('resetViewBtn');
const exportJsonBtn = document.getElementById('exportJsonBtn');
const selectMasterBtn = document.getElementById('selectMasterBtn');
const newFileBtn = document.getElementById('newFileBtn');
const openFileBtn = document.getElementById('openFileBtn');
const createMasterBtn = document.getElementById('createMasterBtn');

// Variabili di stato
let originalFilename = '';
let loadedImage = null;
let cellsData = [];
let selectedCellIndex = null;
let projectName = '';
let isMasterMode = false;
let selectedMaster = null;
let headerAssociations = {};

// Colori per le celle
const cellColors = {
    'header': 'rgba(33, 150, 243, 0.15)',   // Blu (più trasparente)
    'data': 'rgba(76, 175, 80, 0.1)',       // Verde (più trasparente)
    'other': 'rgba(255, 152, 0, 0.1)',      // Arancione (più trasparente)
    'null': 'rgba(158, 158, 158, 0.1)',     // Grigio (più trasparente)
    'boolean': 'rgba(156, 39, 176, 0.1)',   // Viola (più trasparente)
    'default': 'rgba(76, 175, 80, 0.1)'     // Default (stesso del data)
};

// Colori per le celle selezionate
const selectedCellColors = {
    'header': 'rgba(33, 150, 243, 0.35)',   // Blu più intenso
    'data': 'rgba(76, 175, 80, 0.3)',       // Verde più intenso
    'other': 'rgba(255, 152, 0, 0.3)',      // Arancione più intenso
    'null': 'rgba(158, 158, 158, 0.3)',     // Grigio più intenso
    'boolean': 'rgba(156, 39, 176, 0.3)',   // Viola più intenso
    'default': 'rgba(76, 175, 80, 0.3)'     // Default (stesso del data)
};

// Colori per le associazioni header-data
const associationColors = [
    'rgba(233, 30, 99, 0.3)',   // Rosa
    'rgba(156, 39, 176, 0.3)',  // Viola
    'rgba(0, 188, 212, 0.3)',   // Ciano
    'rgba(255, 87, 34, 0.3)',   // Rosso-arancio
    'rgba(121, 85, 72, 0.3)',   // Marrone
    'rgba(63, 81, 181, 0.3)',   // Indaco
    'rgba(0, 150, 136, 0.3)',   // Verde acqua
    'rgba(205, 220, 57, 0.3)'   // Lime
];

// Variabili per zoom e pan
let scale = 1;
let translateX = 0;
let translateY = 0;
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

// Funzione per generare un nome progetto casuale
function generateProjectName() {
    const prefix = 'progetto_';
    const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').substring(0, 14);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}${timestamp}_${random}`;
}

// Gestione del nome progetto
projectNameDisplay.addEventListener('click', () => {
    // Mostra l'input per la modifica
    projectNameDisplay.style.display = 'none';
    projectNameInput.style.display = 'block';
    projectNameInput.value = projectName || '';
    projectNameInput.focus();

    // Seleziona tutto il testo per facilitare la modifica
    projectNameInput.select();
});

// Funzione per salvare il nome del progetto
function saveProjectName() {
    const newName = projectNameInput.value.trim();
    if (newName) {
        projectName = newName;
    }
    updateProjectNameDisplay();
    projectNameInput.style.display = 'none';
    projectNameDisplay.style.display = 'inline-block';
}

projectNameInput.addEventListener('blur', saveProjectName);

projectNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault(); // Previene il comportamento di default
        saveProjectName();
    } else if (e.key === 'Escape') {
        // Annulla la modifica e ripristina il valore originale
        projectNameInput.value = projectName || '';
        projectNameInput.style.display = 'none';
        projectNameDisplay.style.display = 'inline-block';
    }
});

function updateProjectNameDisplay() {
    projectNameDisplay.textContent = projectName || 'Nessun progetto';
}

// Gestione input file
imageInput.addEventListener('change', () => {
    if (imageInput.files.length > 0) {
        // Genera un nome progetto se non esiste
        if (!projectName) {
            projectName = generateProjectName();
            updateProjectNameDisplay();
        }

        // Mostra il pulsante elabora
        processBtn.classList.remove('hidden');
        processBtn.disabled = false;

        // Aggiorna lo status
        const fileName = imageInput.files[0].name;
        statusSpan.textContent = `File selezionato: ${fileName}`;
    }
});

projectInput.addEventListener('change', () => {
    if (projectInput.files.length > 0) {
        loadProject(projectInput.files[0]);
    }
});

masterInput.addEventListener('change', () => {
    if (masterInput.files.length > 0) {
        // Genera un nome progetto se non esiste
        if (!projectName) {
            projectName = generateProjectName();
            updateProjectNameDisplay();
        }

        isMasterMode = true;
        processBtn.classList.remove('hidden');
        processBtn.disabled = false;

        // Aggiorna lo status
        const fileName = masterInput.files[0].name;
        statusSpan.textContent = `Master selezionato: ${fileName}`;
    }
});

// Pulsante elabora
processBtn.addEventListener('click', () => {
    if (isMasterMode && masterInput.files.length > 0) {
        statusSpan.textContent = 'Elaborazione master in corso...';
        processBtn.disabled = true;
        uploadAndProcessImage(masterInput.files[0], projectName, true);
    } else if (imageInput.files.length > 0) {
        statusSpan.textContent = 'Elaborazione in corso...';
        processBtn.disabled = true;
        uploadAndProcessImage(imageInput.files[0], projectName, false);
    }
});

function uploadAndProcessImage(file, projectName, isMaster = false) {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('project_name', projectName);

    // Aggiungi flag per indicare se è un master
    if (isMaster) {
        formData.append('is_master', 'true');
    }

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

        // Aggiorna il nome del progetto nel display
        updateProjectNameDisplay();

        // Carica l'immagine elaborata
        if (data.image_data) {
            loadedImage = new Image();
            loadedImage.onload = () => {
                // Reset zoom e pan
                resetView();
                drawTable();

                // Aggiorna lo status in base alla modalità
                if (isMaster) {
                    statusSpan.textContent = 'Master elaborato. Seleziona una cella.';
                    // Abilita il pulsante seleziona master
                    selectMasterBtn.disabled = false;
                } else {
                    statusSpan.textContent = 'Elaborazione completata. Seleziona una cella.';
                }

                // Abilita il pulsante di esportazione JSON
                exportJsonBtn.disabled = false;

                // Nascondi il pulsante elabora
                processBtn.classList.add('hidden');
            };
            loadedImage.src = data.image_data;
        } else {
            statusSpan.textContent = 'Elaborazione completata, ma nessuna immagine ricevuta.';
            drawTable();
            processBtn.classList.add('hidden');
        }
    })
    .catch(() => {
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

        // Crea una mappa delle associazioni per colorare le celle
        const associationMap = {};
        let colorIndex = 0;

        // Assegna colori alle associazioni header-data
        for (const headerId in headerAssociations) {
            const color = associationColors[colorIndex % associationColors.length];
            associationMap[headerId] = {
                color: color,
                dataCells: headerAssociations[headerId]
            };

            // Assegna lo stesso colore alle celle di dati associate
            headerAssociations[headerId].forEach(dataCellId => {
                associationMap[dataCellId] = {
                    color: color,
                    isData: true
                };
            });

            colorIndex++;
        }

        // Disegna i rettangoli delle celle
        cellsData.forEach((cell, idx) => {
            const [x, y, w, h] = cell.coords;
            // Usa 'default' se il tipo non è definito, altrimenti usa il tipo della cella
            const cellType = cell.type || 'default';

            // Determina il colore di riempimento
            let fillColor;

            // Se la cella è in un'associazione, usa il colore dell'associazione
            if (associationMap[cell.id]) {
                fillColor = associationMap[cell.id].color;

                // Se è un header, usa una versione più scura del colore
                if (!associationMap[cell.id].isData) {
                    // Rendi il colore più scuro per gli header
                    fillColor = fillColor.replace(/rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/,
                        (_, r, g, b, a) => `rgba(${r}, ${g}, ${b}, ${parseFloat(a) * 1.5})`);
                }
            } else {
                // Altrimenti usa il colore standard per il tipo di cella
                fillColor = idx === selectedCellIndex ?
                    selectedCellColors[cellType] :
                    cellColors[cellType];
            }

            // Riempi la cella con il colore appropriato
            ctx.fillStyle = fillColor;
            ctx.fillRect(x, y, w, h);

            // Disegna il bordo
            ctx.strokeStyle = (idx === selectedCellIndex) ? '#1976d2' : '#388e3c';
            ctx.lineWidth = (idx === selectedCellIndex) ? 3/scale : 1.5/scale;
            ctx.strokeRect(x, y, w, h);

            // Adatta la dimensione del font allo zoom
            ctx.font = `${12/scale}px Arial`;
            ctx.fillStyle = '#333';
            ctx.fillText(cell.id, x + 4, y + 16);

            // Se è un header, mostra un indicatore
            if (cellType === 'header') {
                ctx.fillStyle = '#1976d2';
                ctx.beginPath();
                ctx.arc(x + w - 8, y + 8, 4/scale, 0, Math.PI * 2);
                ctx.fill();
            }
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

// Elementi DOM per il pannello di associazione
const headerAssociationPanel = document.getElementById('headerAssociationPanel');
const dataCellInput = document.getElementById('dataCellInput');
const dataCellsList = document.getElementById('dataCellsList');
const addCellBtn = document.getElementById('addCellBtn');
const selectedCellsTags = document.getElementById('selectedCellsTags');
const saveAssociationsBtn = document.getElementById('saveAssociationsBtn');

// Elementi DOM per il pannello di configurazione boolean
const booleanConfigPanel = document.getElementById('booleanConfigPanel');
const fillThreshold = document.getElementById('fillThreshold');
const thresholdValue = document.getElementById('thresholdValue');
const trueValue = document.getElementById('trueValue');
const falseValue = document.getElementById('falseValue');
const testBooleanBtn = document.getElementById('testBooleanBtn');
const booleanTestResult = document.getElementById('booleanTestResult');
const testResultValue = document.getElementById('testResultValue');
const fillRatioValue = document.getElementById('fillRatioValue');
const saveBooleanConfigBtn = document.getElementById('saveBooleanConfigBtn');

// Array temporaneo per tenere traccia delle celle selezionate per l'header corrente
let tempSelectedCells = [];

function selectCell(idx) {
    selectedCellIndex = idx;
    const cell = cellsData[idx];
    cellIdInput.value = cell.id;
    cellContentTextarea.value = cell.text || '';
    cellTypeSelect.value = cell.type || 'data';
    saveCellBtn.disabled = false;

    // Nascondi tutti i pannelli di configurazione
    headerAssociationPanel.classList.add('hidden');
    booleanConfigPanel.classList.add('hidden');

    // Gestisci il pannello di associazione per gli header
    if (cell.type === 'header') {
        headerAssociationPanel.classList.remove('hidden');

        // Carica le celle già associate a questo header
        tempSelectedCells = headerAssociations[cell.id] || [];

        // Aggiorna la visualizzazione delle celle selezionate
        updateSelectedCellsTags();

        // Popola il datalist con le celle di tipo data disponibili
        populateDataCellsList();
    }
    // Gestisci il pannello di configurazione per le celle boolean
    else if (cell.type === 'boolean') {
        booleanConfigPanel.classList.remove('hidden');

        // Carica la configurazione boolean dalla cella
        const booleanConfig = cell.booleanConfig || {
            threshold: 0.02,
            trueValue: 'true',
            falseValue: 'false'
        };

        // Imposta i valori nei controlli
        fillThreshold.value = booleanConfig.threshold * 100;
        thresholdValue.textContent = `${Math.round(booleanConfig.threshold * 100)}%`;
        trueValue.value = booleanConfig.trueValue || 'true';
        falseValue.value = booleanConfig.falseValue || 'false';

        // Nascondi il risultato del test
        booleanTestResult.classList.add('hidden');
    }

    drawTable();
}

// Popola il datalist con le celle di tipo data disponibili
function populateDataCellsList() {
    // Svuota il datalist
    dataCellsList.innerHTML = '';

    // Ottieni tutte le celle già associate a qualsiasi header
    const allAssociatedCells = new Set();
    for (const headerId in headerAssociations) {
        headerAssociations[headerId].forEach(cellId => {
            allAssociatedCells.add(cellId);
        });
    }

    // Ottieni tutte le celle di tipo data non ancora associate ad altri header
    // e non già selezionate per questo header
    const availableCells = cellsData.filter(cell =>
        cell.type === 'data' &&
        !allAssociatedCells.has(cell.id) &&
        !tempSelectedCells.includes(cell.id) &&
        cell.id !== (cellsData[selectedCellIndex] ? cellsData[selectedCellIndex].id : null)
    );

    // Aggiungi le celle al datalist
    availableCells.forEach(cell => {
        const option = document.createElement('option');
        option.value = cell.id;
        option.textContent = `${cell.id}: ${cell.text.substring(0, 30)}${cell.text.length > 30 ? '...' : ''}`;
        dataCellsList.appendChild(option);
    });
}

// Aggiorna la visualizzazione dei tag delle celle selezionate
function updateSelectedCellsTags() {
    selectedCellsTags.innerHTML = '';

    if (tempSelectedCells.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'empty-selection';
        emptyMessage.textContent = 'Nessuna cella selezionata';
        selectedCellsTags.appendChild(emptyMessage);
        return;
    }

    tempSelectedCells.forEach(cellId => {
        const cell = cellsData.find(c => c.id === cellId);
        if (!cell) return;

        const tag = document.createElement('div');
        tag.className = 'cell-tag';

        const tagText = document.createElement('span');
        tagText.className = 'cell-tag-text';
        tagText.title = `${cell.id}: ${cell.text}`;
        tagText.textContent = `${cell.id}: ${cell.text.substring(0, 20)}${cell.text.length > 20 ? '...' : ''}`;

        const removeBtn = document.createElement('span');
        removeBtn.className = 'remove-tag';
        removeBtn.textContent = '×';
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            removeCellFromSelection(cellId);
        };

        tag.appendChild(tagText);
        tag.appendChild(removeBtn);
        selectedCellsTags.appendChild(tag);
    });
}

function clearDetailsPanel() {
    selectedCellIndex = null;
    cellIdInput.value = '';
    cellContentTextarea.value = '';
    cellTypeSelect.value = 'data';
    saveCellBtn.disabled = true;
    headerAssociationPanel.classList.add('hidden');
    booleanConfigPanel.classList.add('hidden');
    drawTable();
}

// Rimuove una cella dalla selezione temporanea
function removeCellFromSelection(cellId) {
    // Rimuovi la cella dall'array temporaneo
    tempSelectedCells = tempSelectedCells.filter(id => id !== cellId);

    // Aggiorna la visualizzazione
    updateSelectedCellsTags();

    // Aggiorna il datalist per includere questa cella nuovamente
    populateDataCellsList();
}

// Gestione del cambio di tipo cella
cellTypeSelect.addEventListener('change', () => {
    if (selectedCellIndex === null) return;

    const newType = cellTypeSelect.value;
    const cellId = cellsData[selectedCellIndex].id;

    // Nascondi tutti i pannelli di configurazione
    headerAssociationPanel.classList.add('hidden');
    booleanConfigPanel.classList.add('hidden');

    // Se il tipo è cambiato in header, mostra il pannello di associazione
    if (newType === 'header') {
        headerAssociationPanel.classList.remove('hidden');
        tempSelectedCells = headerAssociations[cellId] || [];
        updateSelectedCellsTags();
        populateDataCellsList();
    }
    // Se il tipo è cambiato in boolean, mostra il pannello di configurazione boolean
    else if (newType === 'boolean') {
        booleanConfigPanel.classList.remove('hidden');

        // Inizializza la configurazione boolean se non esiste
        if (!cellsData[selectedCellIndex].booleanConfig) {
            cellsData[selectedCellIndex].booleanConfig = {
                threshold: 0.02,
                trueValue: 'true',
                falseValue: 'false'
            };
        }

        // Imposta i valori nei controlli
        const booleanConfig = cellsData[selectedCellIndex].booleanConfig;
        fillThreshold.value = booleanConfig.threshold * 100;
        thresholdValue.textContent = `${Math.round(booleanConfig.threshold * 100)}%`;
        trueValue.value = booleanConfig.trueValue;
        falseValue.value = booleanConfig.falseValue;
    }

    // Se era un header, rimuovi le associazioni
    if (cellsData[selectedCellIndex].type === 'header' && headerAssociations[cellId] && newType !== 'header') {
        delete headerAssociations[cellId];
    }

    // Aggiorna il tipo
    cellsData[selectedCellIndex].type = newType;

    // Ridisegna
    drawTable();
});

// Gestione dello slider per la soglia di riempimento
fillThreshold.addEventListener('input', () => {
    const value = fillThreshold.value;
    thresholdValue.textContent = `${value}%`;
});

// Gestione del pulsante di test
testBooleanBtn.addEventListener('click', () => {
    if (selectedCellIndex === null || cellsData[selectedCellIndex].type !== 'boolean') return;

    const cell = cellsData[selectedCellIndex];
    const threshold = parseFloat(fillThreshold.value) / 100;

    // Nascondi il risultato del test mentre è in corso
    booleanTestResult.classList.add('hidden');
    testResultValue.textContent = 'In corso...';

    // Invia la richiesta al server
    fetch('/api/test_boolean_cell', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            project_name: projectName,
            cell_id: cell.id,
            threshold: threshold
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            statusSpan.textContent = 'Errore nel test: ' + data.error;
            return;
        }

        // Mostra il risultato
        booleanTestResult.classList.remove('hidden');

        // Formatta il risultato
        const result = data.is_filled ? trueValue.value : falseValue.value;
        testResultValue.textContent = result;

        // Formatta il rapporto di riempimento
        const ratio = data.fill_ratio * 100;
        fillRatioValue.textContent = `${ratio.toFixed(2)}%`;

        // Aggiorna lo status
        statusSpan.textContent = `Test completato. Densità pixel: ${ratio.toFixed(2)}%, Soglia: ${(data.threshold * 100).toFixed(0)}%`;
    })
    .catch(error => {
        statusSpan.textContent = 'Errore di rete durante il test.';
        console.error('Errore durante il test:', error);
    });
});

// Gestione del pulsante di salvataggio della configurazione boolean
saveBooleanConfigBtn.addEventListener('click', () => {
    if (selectedCellIndex === null || cellsData[selectedCellIndex].type !== 'boolean') return;

    // Aggiorna la configurazione boolean
    cellsData[selectedCellIndex].booleanConfig = {
        threshold: parseFloat(fillThreshold.value) / 100,
        trueValue: trueValue.value,
        falseValue: falseValue.value
    };

    // Salva le modifiche
    saveAnnotations();

    statusSpan.textContent = 'Configurazione boolean salvata.';
});

// Salva le modifiche alla cella
saveCellBtn.addEventListener('click', () => {
    if (selectedCellIndex === null) return;

    // Aggiorna il testo
    cellsData[selectedCellIndex].text = cellContentTextarea.value;

    // Salva lato server
    saveAnnotations();

    // Ridisegna per mostrare eventuali cambiamenti
    drawTable();

    statusSpan.textContent = 'Modifiche salvate.';
});

// Gestione dell'input per l'aggiunta di celle
dataCellInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        addCellToSelection();
    }
});

// Gestione dell'aggiunta di una cella alla selezione
addCellBtn.addEventListener('click', () => {
    addCellToSelection();
});

// Funzione per aggiungere una cella alla selezione
function addCellToSelection() {
    if (selectedCellIndex === null || cellsData[selectedCellIndex].type !== 'header') return;

    const cellId = dataCellInput.value;

    // Verifica che la cella esista e sia di tipo data
    const cell = cellsData.find(c => c.id === cellId && c.type === 'data');
    if (!cell) {
        statusSpan.textContent = 'Cella non valida o non disponibile.';
        return;
    }

    // Aggiungi la cella alla selezione temporanea se non è già presente
    if (!tempSelectedCells.includes(cellId)) {
        tempSelectedCells.push(cellId);

        // Aggiorna la visualizzazione
        updateSelectedCellsTags();

        // Aggiorna il datalist
        populateDataCellsList();

        // Pulisci l'input
        dataCellInput.value = '';
    }
}

// Gestione del salvataggio delle associazioni
saveAssociationsBtn.addEventListener('click', () => {
    if (selectedCellIndex === null || cellsData[selectedCellIndex].type !== 'header') return;

    const headerId = cellsData[selectedCellIndex].id;

    // Aggiorna le associazioni con le celle selezionate temporaneamente
    if (tempSelectedCells.length > 0) {
        headerAssociations[headerId] = [...tempSelectedCells];
    } else {
        // Se non ci sono celle selezionate, rimuovi l'associazione
        delete headerAssociations[headerId];
    }

    // Ridisegna la tabella
    drawTable();

    // Salva le modifiche
    saveAnnotations();

    statusSpan.textContent = 'Associazioni salvate.';
});

// Questo event listener è stato spostato nella sezione iniziale

// Funzione per caricare un progetto
function loadProject(file) {
    statusSpan.textContent = 'Caricamento progetto…';
    const fd = new FormData();
    fd.append('project', file);

    fetch('/api/load_project', { method: 'POST', body: fd })
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          statusSpan.textContent = data.error;
          return;
        }

        // Aggiorna i dati del progetto
        projectName = data.project_name;
        cellsData = data.cells;
        isMasterMode = data.is_master || false;
        headerAssociations = data.header_associations || {};

        // Aggiorna il display del nome progetto
        updateProjectNameDisplay();

        // Crea oggetto Image da Base64
        loadedImage = new Image();
        loadedImage.onload = () => {
          // Reset zoom e pan
          resetView();
          drawTable();
          statusSpan.textContent = `Progetto "${projectName}" caricato.`;

          // Abilita i pulsanti appropriati
          exportJsonBtn.disabled = false;

          // Se è un master, abilita il pulsante seleziona master
          if (isMasterMode) {
            selectMasterBtn.disabled = false;
          }
        };
        loadedImage.src = data.image_data;  // usa il data-URL
      })
      .catch(() => statusSpan.textContent = 'Errore caricamento.');
}

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

// Riferimento al pulsante batch process
const batchProcessBtn = document.getElementById('batchProcessBtn');

// Funzionalità di esportazione JSON (placeholder)
exportJsonBtn.addEventListener('click', () => {
    if (!cellsData.length || !projectName) {
        statusSpan.textContent = 'Nessun dato da esportare.';
        return;
    }

    // Prepara i dati per l'esportazione (solo i dati, senza le coordinate)
    const exportData = {
        project_name: projectName,
        cells: cellsData.map(cell => ({
            id: cell.id,
            text: cell.text,
            type: cell.type
        }))
    };

    // Crea un blob e un link per il download
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName}_export.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    statusSpan.textContent = 'JSON esportato con successo.';
});

// Funzionalità di elaborazione batch (placeholder)
batchProcessBtn.addEventListener('click', () => {
    statusSpan.textContent = 'Funzionalità di elaborazione batch in sviluppo.';
});

// Elementi DOM per il modal di selezione del master
const masterSelectionModal = document.getElementById('masterSelectionModal');
const closeModalBtn = document.querySelector('.close-modal');
const mastersList = document.getElementById('mastersList');

// Funzionalità di selezione master
selectMasterBtn.addEventListener('click', () => {
    // Se è in modalità master, salva il master corrente
    if (isMasterMode && projectName) {
        // Salva il master corrente come template
        fetch('/api/save_master', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                project_name: projectName,
                cells: cellsData,
                header_associations: headerAssociations
            })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                statusSpan.textContent = 'Master salvato come template.';
            } else {
                statusSpan.textContent = 'Errore nel salvataggio del master: ' + (data.error||'');
            }
        })
        .catch(() => {
            statusSpan.textContent = 'Errore di rete nel salvataggio del master.';
        });
    } else {
        // Altrimenti mostra il modal per selezionare un master
        loadMastersList();
        masterSelectionModal.classList.remove('hidden');
    }
});

// Chiudi il modal
closeModalBtn.addEventListener('click', () => {
    masterSelectionModal.classList.add('hidden');
});

// Chiudi il modal se si clicca fuori dal contenuto
masterSelectionModal.addEventListener('click', (e) => {
    if (e.target === masterSelectionModal) {
        masterSelectionModal.classList.add('hidden');
    }
});

// Carica la lista dei master disponibili
function loadMastersList() {
    fetch('/api/list_masters')
        .then(res => res.json())
        .then(data => {
            mastersList.innerHTML = '';

            if (!data.masters || data.masters.length === 0) {
                mastersList.innerHTML = '<p>Nessun master disponibile.</p>';
                return;
            }

            data.masters.forEach(master => {
                const masterItem = document.createElement('div');
                masterItem.className = 'master-item';
                masterItem.dataset.id = master.id;

                const header = document.createElement('div');
                header.className = 'master-item-header';

                const name = document.createElement('div');
                name.className = 'master-name';
                name.textContent = master.name;

                const date = document.createElement('div');
                date.className = 'master-date';
                date.textContent = master.created_at;

                header.appendChild(name);
                header.appendChild(date);
                masterItem.appendChild(header);

                // Aggiungi l'evento click per selezionare questo master
                masterItem.addEventListener('click', () => selectMasterTemplate(master.id));

                mastersList.appendChild(masterItem);
            });
        })
        .catch(error => {
            mastersList.innerHTML = '<p>Errore nel caricamento dei master.</p>';
            console.error('Errore nel caricamento dei master:', error);
        });
}

// Seleziona un master template
function selectMasterTemplate(masterId) {
    fetch(`/api/get_master/${masterId}`)
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                statusSpan.textContent = 'Errore: ' + data.error;
                return;
            }

            // Salva il master selezionato
            selectedMaster = data;

            // Chiudi il modal
            masterSelectionModal.classList.add('hidden');

            // Aggiorna lo status
            statusSpan.textContent = `Master "${data.project_name}" selezionato.`;

            // Se c'è un'immagine caricata, applica il master
            if (loadedImage && cellsData.length > 0) {
                applyMasterTemplate();
            }
        })
        .catch(error => {
            statusSpan.textContent = 'Errore nel caricamento del master.';
            console.error('Errore nel caricamento del master:', error);
        });
}

// Applica il master template all'immagine corrente
function applyMasterTemplate() {
    if (!selectedMaster || !cellsData.length) return;

    // Aggiorna i tipi di cella in base al master
    selectedMaster.cells.forEach(masterCell => {
        // Trova la cella corrispondente nell'immagine corrente
        const matchingCell = findMatchingCell(masterCell);
        if (matchingCell) {
            // Aggiorna il tipo di cella
            matchingCell.type = masterCell.type;

            // Se è un header, non applicare OCR
            if (masterCell.type === 'header' || masterCell.type === 'null') {
                matchingCell.text = masterCell.text;
            }
        }
    });

    // Applica le associazioni header-data
    if (selectedMaster.header_associations) {
        headerAssociations = {};

        // Per ogni header nel master
        for (const headerId in selectedMaster.header_associations) {
            const masterHeaderCell = selectedMaster.cells.find(cell => cell.id === headerId);
            if (!masterHeaderCell) continue;

            // Trova la cella header corrispondente nell'immagine corrente
            const matchingHeaderCell = findMatchingCell(masterHeaderCell);
            if (!matchingHeaderCell) continue;

            // Trova le celle data associate
            const dataCellIds = [];
            selectedMaster.header_associations[headerId].forEach(dataCellId => {
                const masterDataCell = selectedMaster.cells.find(cell => cell.id === dataCellId);
                if (!masterDataCell) return;

                const matchingDataCell = findMatchingCell(masterDataCell);
                if (matchingDataCell) {
                    dataCellIds.push(matchingDataCell.id);
                }
            });

            // Aggiorna le associazioni
            if (dataCellIds.length > 0) {
                headerAssociations[matchingHeaderCell.id] = dataCellIds;
            }
        }
    }

    // Ridisegna la tabella
    drawTable();

    // Salva le modifiche
    saveAnnotations();

    statusSpan.textContent = 'Master applicato con successo.';
}

// Trova la cella corrispondente in base alla posizione
function findMatchingCell(masterCell) {
    if (!masterCell.coords || !cellsData.length) return null;

    // Estrai le coordinate
    const [mx, my, mw, mh] = masterCell.coords;
    const masterCenterX = mx + mw / 2;
    const masterCenterY = my + mh / 2;

    // Trova la cella più vicina
    let closestCell = null;
    let minDistance = Infinity;

    cellsData.forEach(cell => {
        const [x, y, w, h] = cell.coords;
        const centerX = x + w / 2;
        const centerY = y + h / 2;

        // Calcola la distanza euclidea tra i centri
        const distance = Math.sqrt(
            Math.pow(centerX - masterCenterX, 2) +
            Math.pow(centerY - masterCenterY, 2)
        );

        // Aggiorna la cella più vicina
        if (distance < minDistance) {
            minDistance = distance;
            closestCell = cell;
        }
    });

    // Restituisci la cella più vicina se è abbastanza vicina
    // (usa una soglia basata sulla dimensione media delle celle)
    const avgCellSize = cellsData.reduce((sum, cell) => {
        const [_, __, w, h] = cell.coords;
        return sum + Math.max(w, h);
    }, 0) / cellsData.length;

    return minDistance < avgCellSize * 0.5 ? closestCell : null;
}

function saveAnnotations() {
    // Assicurati che tutte le proprietà delle celle vengano preservate
    fetch('/api/annotations', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            project_name: projectName,
            original_filename: originalFilename,
            annotations: cellsData,  // Invia l'intero array di celle senza modifiche
            header_associations: headerAssociations  // Aggiungi le associazioni header-data
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
