import { Octokit } from "https://esm.sh/octokit";

// Constants
const CELL_TYPES = {
  NOT_SET: 'not_set',
  CLUE: 'clue',
  SOLUTION: 'solution',
  ARROW: 'arrow',
  BLOCKED: 'blocked',
  IMAGE: 'image'
};

const arrowSymbols = {
  normal: {
    right: '→',
    down: '↓',
    'right-down': '↴',
    'down-right': '↳',
    'left-down': '↲',
    'up-right': '↱'
  },
  bold: {
    right: '➜',
    down: '⬇',
    'right-down': '➥',
    'down-right': '➦',
    'left-down': '➧',
    'up-right': '➨'
  }
};

// Global variables
let grid = [];
let rows = 15;
let cols = 15;
let selectedRow = 0;
let selectedCol = 0;
let anchorRow = 0;
let anchorCol = 0;
let isMultiSelecting = false;
let multiSelectedCells = [];

// Octokit for GitHub
const octokit = new Octokit({ auth: 'your-pat-here' }); // Replace with your Personal Access Token

function initGrid() {
  grid = Array.from({length: rows}, () => Array.from({length: cols}, () => ({type: 'not_set'})));
  renderGrid();
  selectCell(0, 0); // Start at A1
}

function renderGrid() {
  const table = document.getElementById('grid');
  table.innerHTML = '';
  const adjustCells = []; // Collect cells that need font adjustment
  for (let r = 0; r < rows; r++) {
    const tr = document.createElement('tr');
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      if (cell.type === 'merged') continue;
      const td = document.createElement('td');
      td.className = cell.type;
      td.dataset.row = r;
      td.dataset.col = c;
      if (cell.spanRows) td.rowSpan = cell.spanRows;
      if (cell.spanCols) td.colSpan = cell.spanCols;
      if (cell.type === 'solution') {
        const text = document.getElementById('editMode').checked ? cell.letter : '';
        td.innerText = text.toUpperCase();
        if (text) adjustCells.push(td);
      } else if (cell.type === 'arrow') {
        td.innerText = arrowSymbols[cell.style || 'normal'][cell.look || 'right'];
      } else if (cell.type === 'clue') {
        const text = cell.clues ? cell.clues.map(cl => cl.text).join('/') : '';
        td.innerText = text.toUpperCase();
        if (text) adjustCells.push(td);
      } else if (cell.type === 'image' && cell.url) {
        td.style.backgroundImage = `url(${cell.url})`;
      } else if (cell.type === 'not_set') {
        td.innerText = ''; // Explicitly empty for not_set
      }
      td.onclick = () => selectCell(r, c);
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
  // Adjust font sizes after all elements are in the DOM
  adjustCells.forEach(td => adjustFontSize(td, td.innerText));
  highlightSelected();
}

function adjustFontSize(element) {
  const text = element.innerText;
  if (!text) return;
  const maxWidth = 40 * (element.colSpan || 1); // Account for colSpan
  const maxHeight = 40 * (element.rowSpan || 1); // Account for rowSpan
  element.style.whiteSpace = 'normal';
  element.style.wordBreak = 'break-word';
  let fontSize = 18;

  // Set initial font size and measure
  element.style.fontSize = `${fontSize}px`;
  while ((element.scrollWidth > maxWidth || element.scrollHeight > maxHeight) && fontSize > 6) {
    fontSize -= 0.5; // Smaller steps for smoother adjustment
    element.style.fontSize = `${fontSize}px`;
  }

  // Ensure font size doesn't exceed 18px
  if (fontSize > 18) {
    element.style.fontSize = '18px';
  }
}

function resizeGrid() {
  const newRows = parseInt(document.getElementById('rows').value) || 15;
  const newCols = parseInt(document.getElementById('cols').value) || 15;
  const newGrid = Array.from({length: newRows}, (_, r) => 
    Array.from({length: newCols}, (_, c) => 
      (r < rows && c < cols) ? grid[r][c] : {type: 'not_set'}
    )
  );
  rows = newRows;
  cols = newCols;
  grid = newGrid;
  if (selectedRow >= rows) selectedRow = rows - 1;
  if (selectedCol >= cols) selectedCol = cols - 1;
  renderGrid();
  selectCell(selectedRow, selectedCol);
  multiSelectedCells = [];
}

function selectCell(row, col, isMulti = false) {
  if (row < 0 || row >= rows || col < 0 || col >= cols || grid[row][col].type === 'merged') return;
  if (!isMulti) {
    multiSelectedCells = [];
    selectedRow = row;
    selectedCol = col;
    anchorRow = row;
    anchorCol = col;
  } else {
    selectedRow = row;
    selectedCol = col;
    updateMultiSelection();
  }
  highlightSelected();
  displayCellInfo();
}

function updateMultiSelection() {
  multiSelectedCells = [];
  const minR = Math.min(anchorRow, selectedRow);
  const maxR = Math.max(anchorRow, selectedRow);
  const minC = Math.min(anchorCol, selectedCol);
  const maxC = Math.max(anchorCol, selectedCol);
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      if (grid[r][c].type !== 'merged') {
        multiSelectedCells.push({row: r, col: c});
      }
    }
  }
}

function highlightSelected() {
  const cells = document.querySelectorAll('#grid td');
  cells.forEach(td => td.classList.remove('selected', 'multi-selected'));
  if (multiSelectedCells.length > 0) {
    multiSelectedCells.forEach(pos => {
      const td = document.querySelector(`#grid td[data-row="${pos.row}"][data-col="${pos.col}"]`);
      if (td) td.classList.add('multi-selected');
    });
  } else {
    const selectedTd = document.querySelector(`#grid td[data-row="${selectedRow}"][data-col="${selectedCol}"]`);
    if (selectedTd) selectedTd.classList.add('selected');
  }
}

function displayCellInfo() {
  if (multiSelectedCells.length > 1) {
    const infoDiv = document.getElementById('cellInfo');
    infoDiv.innerHTML = '<p>Multiple cells selected. Use cell type buttons to apply.</p>';
    return;
  }
  const cell = grid[selectedRow][selectedCol];
  const infoDiv = document.getElementById('cellInfo');
  infoDiv.innerHTML = '';
  let html = `<h3>Cell ${String.fromCharCode(65 + selectedCol)}${selectedRow + 1} (${cell.type.toUpperCase()})</h3>`;
  
  if (cell.type === 'clue') {
    html += '<form id="clueForm">';
    html += '<label>Number of Sub-Clues (1-3):</label><input type="number" id="numClues" min="1" max="3" value="' + (cell.clues ? cell.clues.length : 1) + '"><br>';
    html += '<div id="clueInputs">';
    const clues = cell.clues || [{text: '', direction: 'across', solution: ''}];
    clues.forEach((clue, i) => {
      const acrossSelected = clue.direction === 'across' ? 'selected' : '';
      const downSelected = clue.direction === 'down' ? 'selected' : '';
      html += `
        <div>
          <label>Clue ${i+1} Text:</label>
          <input type="text" value="${clue.text || ''}" data-clue-index="${i}" class="clue-text">
          <div>Direction: 
            <button type="button" class="dir-btn ${acrossSelected}" data-clue-index="${i}" data-dir="across">→</button>
            <button type="button" class="dir-btn ${downSelected}" data-clue-index="${i}" data-dir="down">↓</button>
          </div>
          <label>Solution:</label>
          <input type="text" value="${clue.solution || ''}" data-clue-index="${i}" class="solution-text">
        </div>`;
    });
    html += '</div><button type="button" id="updateClueBtn">Update Sub-Clues</button>';
    html += '<button type="button" id="saveClueBtn">Save Clue</button></form>';
  } else if (cell.type === 'solution') {
    html += `<form id="solutionForm">
      <label>Letter (A-Z):</label>
      <input type="text" value="${cell.letter || ''}" id="solutionLetter" maxlength="1">
      <button type="button" id="saveSolutionBtn">Save</button>
    </form>`;
  } else if (cell.type === 'arrow') {
    html += `<form id="arrowForm">
      <label>Look:</label>
      <div id="arrowLooks"></div>
      <label>Style:</label>
      <select id="arrowStyle">
        <option value="normal" ${cell.style === 'normal' ? 'selected' : ''}>Normal</option>
        <option value="bold" ${cell.style === 'bold' ? 'selected' : ''}>Bold</option>
      </select>
      <label>Span Rows:</label>
      <input type="number" value="${cell.spanRows || 1}" id="spanRows" min="1">
      <label>Span Cols:</label>
      <input type="number" value="${cell.spanCols || 1}" id="spanCols" min="1">
      <button type="button" id="saveArrowBtn">Save</button>
    </form>`;
  } else if (cell.type === 'blocked') {
    html += '<p>Blocked cell - no editable properties.</p>';
  } else if (cell.type === 'image') {
    html += `<form id="imageForm">
      <label>Image URL (base64):</label>
      <textarea id="imageUrl">${cell.url || ''}</textarea>
      <label>Span Rows:</label>
      <input type="number" value="${cell.spanRows || 1}" id="spanRows" min="1">
      <label>Span Cols:</label>
      <input type="number" value="${cell.spanCols || 1}" id="spanCols" min="1">
      <input type="file" accept="image/*" id="imageUpload">
      <button type="button" id="saveImageBtn">Save</button>
    </form>`;
  } else if (cell.type === 'not_set') {
    html += '<p>Not Set cell - no editable properties. Change type to edit.</p>';
  }
  infoDiv.innerHTML = html;

  // Attach event listeners based on type
  if (cell.type === 'clue') {
    document.getElementById('updateClueBtn').addEventListener('click', updateClueInputs);
    document.getElementById('saveClueBtn').addEventListener('click', saveClueChanges);
    const dirBtns = document.querySelectorAll('.dir-btn');
    dirBtns.forEach(btn => {
      btn.addEventListener('click', handleDirectionClick);
    });
  } else if (cell.type === 'solution') {
    document.getElementById('saveSolutionBtn').addEventListener('click', saveSolutionChanges);
  } else if (cell.type === 'arrow') {
    renderArrowButtons(cell);
    document.getElementById('saveArrowBtn').addEventListener('click', saveArrowChanges);
  } else if (cell.type === 'image') {
    document.getElementById('imageUpload').addEventListener('change', handleImageUpload);
    document.getElementById('saveImageBtn').addEventListener('click', saveImageChanges);
  }
}

function applyType(newType) {
  if (multiSelectedCells.length > 1) {
    if (newType !== 'not_set' && newType !== 'image' && newType !== 'arrow') {
      alert('Multi-select only supports setting to Not Set, Image, or Arrow (linear row or column).');
      return;
    }
    // Find top-left corner (smallest row and col)
    let minR = Math.min(...multiSelectedCells.map(c => c.row));
    let minC = Math.min(...multiSelectedCells.map(c => c.col));
    let maxR = Math.max(...multiSelectedCells.map(c => c.row));
    let maxC = Math.max(...multiSelectedCells.map(c => c.col));

    // Calculate span
    const spanR = maxR - minR + 1;
    const spanC = maxC - minC + 1;

    // Check if all cells in range are selectable (not merged)
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        if (grid[r][c].type === 'merged') {
          alert('Selection includes merged cells. Cannot apply.');
          return;
        }
      }
    }

    // Clear any existing spans in the selected cells
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const cell = grid[r][c];
        if (cell.type === 'image' || cell.type === 'arrow') {
          const sR = cell.spanRows || 1;
          const sC = cell.spanCols || 1;
          for (let i = 0; i < sR; i++) {
            for (let j = 0; j < sC; j++) {
              if (r + i < rows && c + j < cols) {
                grid[r + i][c + j] = {type: 'not_set'};
              }
            }
          }
        } else {
          grid[r][c] = {type: 'not_set'};
        }
      }
    }

    if (newType === 'image') {
      // Set the top-left cell as image with correct span
      const cell = grid[minR][minC];
      cell.type = 'image';
      cell.url = '';
      cell.spanRows = spanR;
      cell.spanCols = spanC;
      for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
          if (r === minR && c === minC) continue;
          grid[r][c].type = 'merged';
        }
      }
    } else if (newType === 'arrow') {
      let look, spanRows, spanCols;
      if (spanR === 1) {
        look = 'right';
        spanRows = 1;
        spanCols = spanC;
      } else if (spanC === 1) {
        look = 'down';
        spanRows = spanR;
        spanCols = 1;
      } else {
        alert('Arrow multi-select must be a single row or column.');
        return;
      }
      const cell = grid[minR][minC];
      cell.type = 'arrow';
      cell.look = look;
      cell.style = 'normal';
      cell.spanRows = spanRows;
      cell.spanCols = spanCols;
      for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
          if (r === minR && c === minC) continue;
          grid[r][c].type = 'merged';
        }
      }
    } else if (newType === 'not_set') {
      // Already set to not_set above
    }
    renderGrid();
    multiSelectedCells = [];
    isMultiSelecting = false;
    selectCell(minR, minC); // Select the top-left for editing
  } else {
    const cell = grid[selectedRow][selectedCol];
    cell.type = newType;
    if (newType === 'clue') {
      cell.clues = [{text: '', direction: 'across', solution: ''}];
    } else if (newType === 'solution') {
      cell.letter = '';
    } else if (newType === 'arrow') {
      cell.look = 'right';
      cell.style = 'normal';
      cell.spanRows = 1;
      cell.spanCols = 1;
    } else if (newType === 'blocked') {
      // No props
    } else if (newType === 'image') {
      cell.url = '';
      cell.spanRows = 1;
      cell.spanCols = 1;
    } else if (newType === 'not_set') {
      // Reset props if any
      delete cell.clues;
      delete cell.letter;
      delete cell.look;
      delete cell.style;
      delete cell.url;
      delete cell.spanRows;
      delete cell.spanCols;
    }
    renderGrid();
    selectCell(selectedRow, selectedCol);
  }
}

function renderArrowButtons(cell) {
  const looksDiv = document.getElementById('arrowLooks');
  looksDiv.innerHTML = '';
  const spanR = cell.spanRows || 1;
  const spanC = cell.spanCols || 1;
  let availableLooks = [];
  if (spanR === 1 && spanC > 1) {
    availableLooks = ['right', 'right-down', 'left-down'];
  } else if (spanC === 1 && spanR > 1) {
    availableLooks = ['down', 'up-right', 'down-right'];
  } else {
    availableLooks = ['right', 'right-down', 'left-down', 'down', 'up-right', 'down-right'];
  }
  availableLooks.forEach(look => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'arrow-btn';
    btn.innerText = arrowSymbols[cell.style || 'normal'][look];
    btn.dataset.look = look;
    if (cell.look === look) btn.classList.add('selected');
    btn.addEventListener('click', () => selectArrowLook(look));
    looksDiv.appendChild(btn);
  });
}

function selectArrowLook(look) {
  const cell = grid[selectedRow][selectedCol];
  cell.look = look;
  displayCellInfo(); // Refresh to update selected button
}

function handleDirectionClick(event) {
  const btn = event.target;
  const i = parseInt(btn.dataset.clueIndex);
  const dir = btn.dataset.dir;
  const cell = grid[selectedRow][selectedCol];
  cell.clues[i].direction = dir;
  displayCellInfo(); // Refresh to update selected class
}

function handleImageUpload(event) {
  const input = event.target;
  if (input.files[0]) {
    const reader = new FileReader();
    reader.onload = () => {
      document.getElementById('imageUrl').value = reader.result;
    };
    reader.readAsDataURL(input.files[0]);
  }
}

function updateClueInputs() {
  const numClues = parseInt(document.getElementById('numClues').value) || 1;
  const cell = grid[selectedRow][selectedCol];
  cell.clues = cell.clues || [];
  while (cell.clues.length < numClues) {
    cell.clues.push({text: '', direction: 'across', solution: ''});
  }
  cell.clues = cell.clues.slice(0, numClues);
  displayCellInfo(); // Refresh inputs
}

function saveClueChanges() {
  const cell = grid[selectedRow][selectedCol];
  const texts = document.querySelectorAll('.clue-text');
  const solutionInputs = document.querySelectorAll('.solution-text');
  let allValid = true;
  const tempClues = cell.clues.map((clue, i) => {
    const newClue = {
      text: texts[i] ? texts[i].value : '',
      direction: clue.direction || 'across',
      solution: (solutionInputs[i] ? solutionInputs[i].value : '').toUpperCase()
    };
    if (!newClue.text || !newClue.direction || !newClue.solution) {
      allValid = false;
    }
    return newClue;
  });

  if (!allValid) {
    alert('Invalid input: All fields (text, direction, solution) must be filled for each clue.');
    return;
  }

  // Check fits for all clues
  for (let clue of tempClues) {
    const targets = [];
    let current = [selectedRow, selectedCol];
    // Move to the first solution cell
    if (clue.direction === 'across') {
      current[1]++;
    } else {
      current[0]++;
    }
    for (let k = 0; k < clue.solution.length; k++) {
      const tr = current[0];
      const tc = current[1];
      if (tr >= rows || tc >= cols) {
        allValid = false;
        break;
      }
      const tcell = grid[tr][tc];
      if (tcell.type !== 'not_set' && tcell.type !== 'solution') {
        allValid = false;
        break;
      }
      if (tcell.type === 'solution' && tcell.letter && tcell.letter !== clue.solution.charAt(k)) {
        allValid = false;
        break;
      }
      targets.push({row: tr, col: tc, letter: clue.solution.charAt(k)});
      if (clue.direction === 'across') current[1]++;
      else current[0]++;
    }
    clue.targets = targets;
    if (!allValid) break;
  }

  if (!allValid) {
    alert('Solution does not fit: Runs off grid, into invalid cell types, or conflicts with existing letters.');
    return;
  }

  // Apply all
  for (let clue of tempClues) {
    for (let tgt of clue.targets) {
      grid[tgt.row][tgt.col] = {type: 'solution', letter: tgt.letter};
    }
  }

  // Save to cell.clues
  cell.clues = tempClues.map(cl => ({text: cl.text, direction: cl.direction, solution: cl.solution}));

  renderGrid();
  displayCellInfo();
  alert('Clue changes saved!');
}

function saveSolutionChanges() {
  const cell = grid[selectedRow][selectedCol];
  cell.letter = document.getElementById('solutionLetter').value.toUpperCase();
  renderGrid();
  alert('Solution changes saved!');
}

function saveArrowChanges() {
  const cell = grid[selectedRow][selectedCol];
  cell.style = document.getElementById('arrowStyle').value;
  const newSpanR = parseInt(document.getElementById('spanRows').value) || 1;
  const newSpanC = parseInt(document.getElementById('spanCols').value) || 1;

  // Unmerge old span
  if (cell.spanRows && cell.spanCols) {
    for (let i = 0; i < cell.spanRows; i++) {
      for (let j = 0; j < cell.spanCols; j++) {
        if (i === 0 && j === 0) continue;
        if (selectedRow + i < rows && selectedCol + j < cols) {
          grid[selectedRow + i][selectedCol + j] = {type: 'not_set'};
        }
      }
    }
  }

  // Apply new span
  cell.spanRows = newSpanR;
  cell.spanCols = newSpanC;
  for (let i = 0; i < newSpanR; i++) {
    for (let j = 0; j < newSpanC; j++) {
      if (i === 0 && j === 0) continue;
      if (selectedRow + i < rows && selectedCol + j < cols) {
        grid[selectedRow + i][selectedCol + j] = {type: 'merged'};
      }
    }
  }

  renderGrid();
  displayCellInfo();
  alert('Arrow changes saved!');
}

function saveImageChanges() {
  const cell = grid[selectedRow][selectedCol];
  const newSpanR = parseInt(document.getElementById('spanRows').value) || 1;
  const newSpanC = parseInt(document.getElementById('spanCols').value) || 1;
  cell.url = document.getElementById('imageUrl').value;

  // Unmerge old span
  if (cell.spanRows && cell.spanCols) {
    for (let i = 0; i < cell.spanRows; i++) {
      for (let j = 0; j < cell.spanCols; j++) {
        if (i === 0 && j === 0) continue;
        if (selectedRow + i < rows && selectedCol + j < cols) {
          grid[selectedRow + i][selectedCol + j] = {type: 'not_set'};
        }
      }
    }
  }

  // Apply new span
  cell.spanRows = newSpanR;
  cell.spanCols = newSpanC;
  for (let i = 0; i < newSpanR; i++) {
    for (let j = 0; j < newSpanC; j++) {
      if (i === 0 && j === 0) continue;
      if (selectedRow + i < rows && selectedCol + j < cols) {
        grid[selectedRow + i][selectedCol + j] = {type: 'merged'};
      }
    }
  }

  renderGrid();
  selectCell(selectedRow, selectedCol);
  alert('Image changes saved!');
}

async function saveToGitHub() {
  const json = JSON.stringify({rows, cols, grid});
  const content = btoa(json);
  const repo = 'your-username/your-repo'; // Replace with your repo
  const path = 'crosswords/my-puzzle.json';
  try {
    const {data: current} = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
      owner: repo.split('/')[0], repo: repo.split('/')[1], path
    });
    await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
      owner: repo.split('/')[0], repo: repo.split('/')[1], path,
      message: 'Save crossword',
      content,
      sha: current.sha
    });
  } catch (e) {
    await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
      owner: repo.split('/')[0], repo: repo.split('/')[1], path,
      message: 'Create crossword',
      content
    });
  }
  alert('Saved to GitHub!');
}

function exportPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const tableData = grid.map(row => row.map(cell => {
    if (cell.type === 'merged' || cell.type === 'not_set') return '';
    if (cell.type === 'solution') return '';
    if (cell.type === 'clue' && cell.clues) return cell.clues.map(cl => cl.text).join('\n');
    if (cell.type === 'arrow') return arrowSymbols[cell.style || 'normal'][cell.look || 'right'];
    if (cell.type === 'image') return '[Image]';
    return '';
  }));
  doc.autoTable({
    head: [],
    body: tableData,
    theme: 'grid',
    styles: { cellPadding: 0.5, fontSize: 8, overflow: 'linebreak' }
  });
  doc.save('crossword.pdf');
}

function exportJPEG() {
  const editMode = document.getElementById('editMode');
  const wasEdit = editMode.checked;
  editMode.checked = false;
  renderGrid();
  html2canvas(document.getElementById('grid')).then(canvas => {
    const link = document.createElement('a');
    link.download = 'crossword.jpg';
    link.href = canvas.toDataURL('image/jpeg');
    link.click();
    editMode.checked = wasEdit;
    renderGrid();
  });
}

// Attach event listeners
document.getElementById('resizeBtn').addEventListener('click', resizeGrid);
document.getElementById('setNotSetBtn').addEventListener('click', () => applyType('not_set'));
document.getElementById('setClueBtn').addEventListener('click', () => applyType('clue'));
document.getElementById('setSolutionBtn').addEventListener('click', () => applyType('solution'));
document.getElementById('setArrowBtn').addEventListener('click', () => applyType('arrow'));
document.getElementById('setBlockedBtn').addEventListener('click', () => applyType('blocked'));
document.getElementById('setImageBtn').addEventListener('click', () => applyType('image'));
document.getElementById('saveBtn').addEventListener('click', saveToGitHub);
document.getElementById('exportPDFBtn').addEventListener('click', exportPDF);
document.getElementById('exportJPEGBtn').addEventListener('click', exportJPEG);
document.getElementById('editMode').addEventListener('change', renderGrid);
document.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault();
    let newRow = selectedRow;
    let newCol = selectedCol;
    if (e.key === 'ArrowUp' && selectedRow > 0) newRow--;
    if (e.key === 'ArrowDown' && selectedRow < rows - 1) newRow++;
    if (e.key === 'ArrowLeft' && selectedCol > 0) newCol--;
    if (e.key === 'ArrowRight' && selectedCol < cols - 1) newCol++;
    if (e.shiftKey) {
      isMultiSelecting = true;
      selectCell(newRow, newCol, true);
    } else {
      selectCell(newRow, newCol);
    }
  }
});
document.addEventListener('keyup', (e) => {
  if (e.key === 'Shift') {
    isMultiSelecting = false;
  }
});

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', initGrid);