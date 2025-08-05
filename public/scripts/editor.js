let cssPanelOpen = false;
let isCodeView = false;
let customClasses = [];
let newClasses = []; // Новые классы, найденные в CSS
let savedSelection = null; // Сохраненное выделение
let selectedModalContent = ""; // Содержимое для модального окна
let selectedModalRange = null; // Диапазон выделения для модального окна

getAllProjects();

function getAllProjects() {
    fetch('/projects')
        .then(res => res.json())
        .then(data => {
            const select = document.getElementById('projectSelect');

            Array.from(select.options)
                .slice(1)
                .forEach(option => option.remove());

            data.projects.forEach(project => {
                const option = document.createElement('option');
                option.value = project;
                option.textContent = project;
                select.appendChild(option);
            });
        });
}

function showCommandsMenu() {
    document.getElementById("commandsDropdownMenu").classList.toggle("show");
}

function createProject() {
    const projectName = prompt('Enter project name:');
    if (!projectName) return;

    fetch('/createproject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName })
    }).then(res => res.json())
        .then(data => alert(data.message))
        .then(getAllProjects())
        .then(selectProject(projectName));
}

async function exportProject() {
    const editor = document.getElementById("editor").cloneNode(true);
    const images = editor.querySelectorAll('img');


    const currentProjectResponse = await fetch('/current_project');
    const currentProjectJson = await currentProjectResponse.json();
    const currentProject = currentProjectJson.project;


    for (const img of images) {
        const serverPath = img.getAttribute('src');
        img.src = serverPath.replace(`projects/${currentProject}/`, '');
    }


    const editorContent = editor.innerHTML;

    const fullHTML = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Мой проект</title>
  <link rel="stylesheet" href="styles/styles.css">
</head>
<body>
  ${editorContent}
  <!-- Подключаем JS файлы -->
  <script src="script.js"></script>
</body>
</html>`;

    // Использование
    const cssContent = await getExternalCSS();

    const response = await fetch('/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            html: fullHTML,
            css: cssContent
        })
    });

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentProject}.zip`;
    document.body.appendChild(a);
    a.click();

    document.body.removeChild(a);
    URL.revokeObjectURL(url);

}

// Выбор проекта
document.getElementById('projectSelect').addEventListener('change', (e) => {
    const projectName = e.target.value;
    selectProject(projectName);
});

async function selectProject(projectName) {
    if (!projectName) return;

    const select = document.getElementById('projectSelect');
    select.value = projectName;

    const response = await fetch('/selectproject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName })
    });

    const responseJson = await response.json();
    const htmlContent = responseJson.htmlContent;

    const editor = document.getElementById('editor');
    editor.innerHTML = htmlContent;
}

async function uploadImage(e) {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const result = await response.json();
            insertImage(result.filePath);
            console.log(result.fileName + ": " + result.filePath);
        } else {
            throw new Error('File upload failed');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error uploading file');
    }
}

function insertImage(imageData) {
    const editor = document.getElementById('editor');
    const selection = window.getSelection();

    if (selection && selection.rangeCount > 0) {
        // Если есть выделение - вставляем на место выделения
        const range = selection.getRangeAt(0);
        range.deleteContents();

        const img = document.createElement('img');
        img.src = imageData;
        range.insertNode(img);
    } else {
        // Если нет выделения - вставляем в текущую позицию курсора
        const cursorPos = editor.selectionStart;
        const text = editor.value;

        editor.value = text.substring(0, cursorPos) +
            `<img src="${imageData}" alt="Загруженное изображение">` +
            text.substring(cursorPos);
    }

    // Сбрасываем значение input, чтобы можно было загрузить то же изображение снова
    document.getElementById('image-upload').value = '';
}

function importDocx(event) {
    readFileInputEventAsArrayBuffer(event, function (arrayBuffer) {
        mammoth.convertToHtml({ arrayBuffer: arrayBuffer })
            .then(displayResult, function (error) {
                console.error(error);
            });
    });
}

function readFileInputEventAsArrayBuffer(event, callback) {
    var file = event.target.files[0];

    var reader = new FileReader();

    reader.onload = function (loadEvent) {
        var arrayBuffer = loadEvent.target.result;
        callback(arrayBuffer);
    };

    reader.readAsArrayBuffer(file);
}

function displayResult(result) {
    editor.innerHTML = result.value;
    addClasses();
    updateCodeView();
    //document.getElementById("output").innerHTML = result.value;

    console.log(result.value);
}

function addClasses() {
    const cssClasses = {
        'h1': ['header-div1'],
        'h2': ['header-div2'],
        'h3': ['header-div3'],
        'table': ['my-table'],
        'ul': ['custom-list1']
    };

    const editor = document.getElementById('editor');
    const content = editor.innerHTML;

    const parser = new DOMParser()
    const doc = parser.parseFromString(content, 'text/html');

    Object.entries(cssClasses).forEach(([tag, classNames]) => {
        const elements = doc.getElementsByTagName(tag);
        Array.from(elements).forEach(element => {
            element.classList.add(...classNames);
        });
    });

    editor.innerHTML = doc.body.innerHTML;
    updateCodeView();
}

function clearAttributes() {

    /*
    Ключ - тег, атрибуты которого нужно сохранить. * - все теги
    Значение - массив атрибутов, которые нужно сохранить. * - сохраняются все атрибуты
    */
    const elementsToSave = {
        'img': ['src'],
        'table': '*',
        'tr': '*',
        'td': ['colspan', 'rowspan'],
        'th': ['colspan', 'rowspan'],
        '*': []
    };

    const editor = document.getElementById('editor');
    if (!editor) {
        return;
    }

    const content = editor.innerHTML;
    const parser = new DOMParser();

    const doc = parser.parseFromString(content, 'text/html');

    const elements = doc.querySelectorAll("*");

    elements.forEach(element => {
        const name = element.tagName.toLowerCase();
        const attributesToSave = elementsToSave[name] || elementsToSave['*'] || [];

        if (attributesToSave === '*') return;

        const attributes = Array.from(element.attributes);

        attributes.forEach(attr => {
            const attrName = attr.name;

            if (attributesToSave.includes(attrName))
                return;
            element.removeAttribute(attrName);
        });
    });

    editor.innerHTML = doc.body.innerHTML;
    updateCodeView();
}

function saveSelection() {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
        savedSelection = selection.getRangeAt(0).cloneRange();
    }
}

function restoreSelection() {
    if (savedSelection) {
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(savedSelection);
    }
}

function changeParagraphType() {
    // Проверяем, находится ли курсор в абзаце или заголовке
    const selection = window.getSelection();
    const anchorNode = selection.anchorNode;

    if (!anchorNode) {
        showMessage("Поместите курсор в абзац или заголовок!", "warning");
        return;
    }

    // Находим родительский элемент
    let parentElement = anchorNode.nodeType === 3 ? anchorNode.parentElement : anchorNode;

    // Ищем ближайший родительский элемент p, h1-h6
    let targetElement = null;
    while (parentElement && parentElement !== document.getElementById("editor")) {
        const tag = parentElement.tagName ? parentElement.tagName.toLowerCase() : '';
        if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
            targetElement = parentElement;
            break;
        }
        parentElement = parentElement.parentElement;
        if (!parentElement) break;
    }

    if (!targetElement) {
        showMessage("Поместите курсор в абзац или заголовок!", "warning");
        return;
    }

    const currentTag = targetElement.tagName.toLowerCase();
    let newTag = 'p';

    // Определяем новый тип элемента
    if (currentTag === 'p') {
        newTag = 'h2'; // По умолчанию h2 для абзаца
    } else {
        newTag = 'p'; // Для заголовков возвращаем абзац
    }

    // Создаем новый элемент
    const newElement = document.createElement(newTag);
    newElement.innerHTML = targetElement.innerHTML;

    // Заменяем старый элемент новым
    targetElement.parentNode.replaceChild(newElement, targetElement);

    showMessage(`Тип изменен на ${newTag === 'p' ? 'абзац' : 'заголовок'}!`, "success");

    updateCodeView();
}

function applyParagraphType() {
    const selection = window.getSelection();
    const anchorNode = selection.anchorNode;

    if (!anchorNode) {
        showMessage("Поместите курсор в абзац или заголовок!", "warning");
        return;
    }

    const newTag = document.getElementById("paragraph-selector").value;
    if (!newTag) {
        showMessage("Выберите тип абзаца!", "warning");
        return;
    }

    // Находим родительский элемент
    let parentElement = anchorNode.nodeType === 3 ? anchorNode.parentElement : anchorNode;

    // Ищем ближайший родительский элемент p, h1-h6
    let targetElement = null;
    while (parentElement && parentElement !== document.getElementById("editor")) {
        const tag = parentElement.tagName ? parentElement.tagName.toLowerCase() : '';
        if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
            targetElement = parentElement;
            break;
        }
        parentElement = parentElement.parentElement;
        if (!parentElement) break;
    }

    if (!targetElement) {
        showMessage("Поместите курсор в абзац или заголовок!", "warning");
        return;
    }

    // Создаем новый элемент
    const newElement = document.createElement(newTag);
    newElement.innerHTML = targetElement.innerHTML;

    // Заменяем старый элемент новым
    targetElement.parentNode.replaceChild(newElement, targetElement);

    showMessage(`Тип изменен на ${newTag}!`, "success");

    // Обновляем просмотр кода, если он открыт
    if (isCodeView) {
        updateCodeView();
    }
}

function removeHeading() {
    const selection = window.getSelection();
    const anchorNode = selection.anchorNode;

    if (!anchorNode) {
        showMessage("Поместите курсор в заголовок!", "warning");
        return;
    }

    // Находим родительский элемент
    let parentElement = anchorNode.nodeType === 3 ? anchorNode.parentElement : anchorNode;

    // Ищем ближайший родительский элемент h1-h6
    let targetElement = null;
    while (parentElement && parentElement !== document.getElementById("editor")) {
        const tag = parentElement.tagName ? parentElement.tagName.toLowerCase() : '';
        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
            targetElement = parentElement;
            break;
        }
        parentElement = parentElement.parentElement;
        if (!parentElement) break;
    }

    if (!targetElement) {
        showMessage("Поместите курсор в заголовок!", "warning");
        return;
    }

    // Создаем новый элемент абзаца
    const newElement = document.createElement('p');
    newElement.innerHTML = targetElement.innerHTML;

    // Заменяем заголовок абзацем
    targetElement.parentNode.replaceChild(newElement, targetElement);

    showMessage("Заголовок удален!", "success");

    // Обновляем просмотр кода, если он открыт
    if (isCodeView) {
        updateCodeView();
    }
}

function showModalDialog() {
    const selection = window.getSelection();
    if (!selection.toString().trim()) {
        showMessage("Сначала выделите текст для модального окна!", "warning");
        return;
    }

    saveSelection();

    // Сохраняем выделение и его содержимое
    const range = selection.getRangeAt(0);
    selectedModalContent = range.cloneContents();
    selectedModalRange = range.cloneRange();

    document.getElementById("modal-dialog").classList.add("show");
    document.getElementById("overlay").classList.add("show");
    document.getElementById("modal-id").focus();
    document.body.style.overflow = "hidden";
}

function closeModalDialog() {
    document.getElementById("modal-dialog").classList.remove("show");
    document.getElementById("overlay").classList.remove("show");
    document.body.style.overflow = "";
    selectedModalContent = "";
    selectedModalRange = null;
    savedSelection = null;
}

function createModal() {
    const modalId = document.getElementById("modal-id").value.trim();
    const buttonText = document.getElementById("modal-button-text").value.trim();

    if (!modalId) {
        showMessage("Введите ID модального окна!", "warning");
        return;
    }

    if (!buttonText) {
        showMessage("Введите текст на кнопке!", "warning");
        return;
    }


    restoreSelection();


    // Создаем кнопку для открытия модального окна
    const selection = window.parent.getSelection();
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const button = document.createElement("button");

        button.className = "modal-trigger";
        button.textContent = buttonText;
        button.dataset.modalId = modalId;
        button.onclick = function () {
            openModal(modalId);
        };

        range.deleteContents();
        range.insertNode(button);
    }

    // Создаем модальное окно в body
    createModalElement(modalId, selectedModalContent);

    closeModalDialog();
    showMessage("Модальное окно создано!", "success");

    // Обновляем просмотр кода, если он открыт
    if (isCodeView) {
        updateCodeView();
    }
}

function createModalElement(id, content) {
    // Проверяем, существует ли уже модальное окно с таким ID
    let modal = document.getElementById(id);
    if (!modal) {
        modal = document.createElement("div");
        modal.className = "custom-modal";
        modal.id = id;

        const editor = document.getElementById("editor");
        const codeView = document.getElementById("code-view");


        editor.appendChild(modal);
    }

    // Создаем контейнер для содержимого
    const contentContainer = document.createElement("div");
    const clonedContent = content.cloneNode(true);
    contentContainer.appendChild(clonedContent);

    modal.innerHTML = `
        <div class="modal-header">
          <span>Модальное окно</span>
          <button class="modal-close" onclick="closeModal('${id}')">&times;</button>
        </div>
        <div class="modal-body">
        </div>
        <div class="modal-footer">
          <button class="modal-button" onclick="closeModal('${id}')">Закрыть</button>
        </div>
      `;

    // Вставляем содержимое в тело модального окна
    modal.querySelector(".modal-body").appendChild(contentContainer);
}

function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add("show");
        document.getElementById("overlay").classList.add("show");
        document.body.style.overflow = "hidden";
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.remove("show");
        document.getElementById("overlay").classList.remove("show");
        document.body.style.overflow = "";
    }
}

function applyClass() {
    const selection = window.getSelection();
    if (!selection.toString().trim()) {
        showMessage("Сначала выделите текст!", "warning");
        return;
    }

    const className = document.getElementById("class-selector").value;
    if (!className) {
        showMessage("Выберите класс!", "warning");
        return;
    }

    const range = selection.getRangeAt(0);
    const span = document.createElement("span");

    span.className = className;

    try {
        range.surroundContents(span);
        showMessage("Класс применен успешно!", "success");
    } catch (e) {
        // Если range.surroundContents не работает (например, при пересечении тегов)
        const selectedContent = range.extractContents();
        span.appendChild(selectedContent);
        range.insertNode(span);
        showMessage("Класс применен!", "success");
    }

    // Снимаем выделение
    selection.removeAllRanges();

    // Обновляем просмотр кода, если он открыт
    if (isCodeView) {
        updateCodeView();
    }
}

function changeClass() {
    const selection = window.getSelection();
    const anchorNode = selection.anchorNode;

    if (!anchorNode) {
        showMessage("Поместите курсор внутрь элемента со стилем!", "warning");
        return;
    }

    // Находим родительский элемент
    let parentElement = anchorNode.nodeType === 3 ? anchorNode.parentElement : anchorNode;

    // Ищем ближайший родительский элемент span с классом
    let spanElement = null;
    while (parentElement && parentElement !== document.getElementById("editor")) {
        if (parentElement.tagName === 'SPAN' && parentElement.className) {
            spanElement = parentElement;
            break;
        }
        parentElement = parentElement.parentElement;
        if (!parentElement) break;
    }

    if (!spanElement) {
        showMessage("Курсор не находится внутри элемента со стилем!", "warning");
        return;
    }

    const newClassName = document.getElementById("class-selector").value;
    if (!newClassName) {
        showMessage("Выберите новый класс!", "warning");
        return;
    }

    // Изменяем класс элемента
    spanElement.className = newClassName;
    showMessage("Класс изменен!", "success");

    // Обновляем просмотр кода, если он открыт
    if (isCodeView) {
        updateCodeView();
    }
}

function removeClass() {
    const selection = window.getSelection();
    const anchorNode = selection.anchorNode;

    if (!anchorNode) {
        showMessage("Поместите курсор внутрь элемента со стилем!", "warning");
        return;
    }

    // Находим родительский элемент
    let parentElement = anchorNode.nodeType === 3 ? anchorNode.parentElement : anchorNode;

    // Ищем ближайший родительский элемент span с классом
    let spanElement = null;
    while (parentElement && parentElement !== document.getElementById("editor")) {
        if (parentElement.tagName === 'SPAN' && parentElement.className) {
            spanElement = parentElement;
            break;
        }
        parentElement = parentElement.parentElement;
        if (!parentElement) break;
    }

    if (!spanElement) {
        showMessage("Курсор не находится внутри элемента со стилем!", "warning");
        return;
    }

    // Заменяем span на его содержимое
    const parent = spanElement.parentNode;
    while (spanElement.firstChild) {
        parent.insertBefore(spanElement.firstChild, spanElement);
    }
    parent.removeChild(spanElement);

    showMessage("Класс удален!", "success");

    // Обновляем просмотр кода, если он открыт
    if (isCodeView) {
        updateCodeView();
    }
}

function applySpecialClass() {
    const selection = window.getSelection();
    if (!selection.toString().trim()) {
        showMessage("Сначала выделите текст!", "warning");
        return;
    }

    const specialType = document.getElementById("special-selector").value;
    if (!specialType) {
        showMessage("Выберите тип выделения!", "warning");
        return;
    }

    const range = selection.getRangeAt(0);
    const div = document.createElement("p");

    div.className = specialType;

    try {
        range.surroundContents(div);
        showMessage("Специальное выделение применено!", "success");
    } catch (e) {
        // Если range.surroundContents не работает (например, при пересечении тегов)
        const selectedContent = range.extractContents();
        div.appendChild(selectedContent);
        range.insertNode(div);
        showMessage("Специальное выделение применено!", "success");
    }

    // Снимаем выделение
    selection.removeAllRanges();

    // Обновляем просмотр кода, если он открыт
    if (isCodeView) {
        updateCodeView();
    }
}

function changeSpecialClass() {
    const selection = window.getSelection();
    const anchorNode = selection.anchorNode;

    if (!anchorNode) {
        showMessage("Поместите курсор внутрь специального выделения!", "warning");
        return;
    }

    // Находим родительский элемент
    let parentElement = anchorNode.nodeType === 3 ? anchorNode.parentElement : anchorNode;

    // Ищем ближайший родительский элемент с классом специального выделения
    const specialClasses = ['definition', 'note', 'warning'];
    let specialElement = null;

    while (parentElement && parentElement !== document.getElementById("editor")) {
        if (specialClasses.some(cls => parentElement.classList.contains(cls))) {
            specialElement = parentElement;
            break;
        }
        parentElement = parentElement.parentElement;
        if (!parentElement) break;
    }

    if (!specialElement) {
        showMessage("Курсор не находится внутри специального выделения!", "warning");
        return;
    }

    const newSpecialType = document.getElementById("special-selector").value;
    if (!newSpecialType) {
        showMessage("Выберите новый тип выделения!", "warning");
        return;
    }

    // Изменяем класс элемента
    specialElement.className = newSpecialType;
    showMessage("Тип выделения изменен!", "success");

    // Обновляем просмотр кода, если он открыт
    if (isCodeView) {
        updateCodeView();
    }
}

function removeSpecialClass() {
    const selection = window.getSelection();
    const anchorNode = selection.anchorNode;

    if (!anchorNode) {
        showMessage("Поместите курсор внутрь специального выделения!", "warning");
        return;
    }

    // Находим родительский элемент
    let parentElement = anchorNode.nodeType === 3 ? anchorNode.parentElement : anchorNode;

    // Ищем ближайший родительский элемент с классом специального выделения
    const specialClasses = ['definition', 'note', 'warning'];
    let specialElement = null;

    while (parentElement && parentElement !== document.getElementById("editor")) {
        if (specialClasses.some(cls => parentElement.classList.contains(cls))) {
            specialElement = parentElement;
            break;
        }
        parentElement = parentElement.parentElement;
        if (!parentElement) break;
    }

    if (!specialElement) {
        showMessage("Курсор не находится внутри специального выделения!", "warning");
        return;
    }

    // Заменяем div на его содержимое
    const parent = specialElement.parentNode;
    while (specialElement.firstChild) {
        parent.insertBefore(specialElement.firstChild, specialElement);
    }
    parent.removeChild(specialElement);

    showMessage("Специальное выделение убрано!", "success");

    // Обновляем просмотр кода, если он открыт
    if (isCodeView) {
        updateCodeView();
    }
}

function toggleView() {
    const editor = document.getElementById("editor");
    const codeView = document.getElementById("code-view");
    const button = document.getElementById("view-toggle-btn");

    isCodeView = !isCodeView;

    if (isCodeView) {
        editor.style.display = "none";
        codeView.style.display = "block";
        button.innerHTML = "<span>Визуально</span>";
        updateCodeView();
    } else {
        editor.style.display = "block";
        codeView.style.display = "none";
        button.innerHTML = "<span>Код</span>";
    }
}

function updateCodeView() {
    if (!isCodeView)
        return

    const editor = document.getElementById("editor");
    const codeView = document.getElementById("code-view");
    codeView.textContent = editor.innerHTML;
}

function toggleCSSEditor() {
    const panel = document.getElementById("cssPanel");
    const overlay = document.getElementById("overlay");

    cssPanelOpen = !cssPanelOpen;

    if (cssPanelOpen) {
        panel.classList.add("open");
        overlay.classList.add("show");
        document.body.style.overflow = "hidden";
    } else {
        panel.classList.remove("open");
        overlay.classList.remove("show");
        document.body.style.overflow = "";
    }
}

function closeAllDialogs() {
    closeModalDialog();
    toggleCSSEditor();
    document.getElementById("class-name-dialog").classList.remove("show");

    // Закрываем все модальные окна
    const modals = document.querySelectorAll(".custom-modal.show");
    modals.forEach(modal => {
        modal.classList.remove("show");
    });

    document.getElementById("overlay").classList.remove("show");
    document.body.style.overflow = "";
}

function extractClassNames(cssText) {
    const classRegex = /\.([a-zA-Z0-9_-]+)/g;
    const classes = [];
    let match;

    while ((match = classRegex.exec(cssText)) !== null) {
        const className = match[1];
        // Исключаем уже существующие классы
        if (!classes.includes(className) &&
            !['highlight', 'code', 'red-text', 'blue-text', 'green-text',
                'large-text', 'small-text', 'definition', 'note', 'warning',
                'modal-trigger', 'custom-modal', 'modal-header', 'modal-close',
                'modal-body', 'modal-footer'].includes(className)) {
            classes.push(className);
        }
    }

    return classes;
}

function updateClassSelector() {
    const selector = document.getElementById("class-selector");
    const defaultOptions = [
        { value: "", text: "Выберите класс..." },
        { value: "highlight", text: "Выделение" },
        { value: "code", text: "Код" },
        { value: "red-text", text: "Красный текст" },
        { value: "blue-text", text: "Синий текст" },
        { value: "green-text", text: "Зеленый текст" },
        { value: "large-text", text: "Крупный текст" },
        { value: "small-text", text: "Мелкий текст" }
    ];

    // Очищаем селектор
    selector.innerHTML = '';

    // Добавляем стандартные опции
    defaultOptions.forEach(option => {
        const opt = document.createElement("option");
        opt.value = option.value;
        opt.textContent = option.text;
        selector.appendChild(opt);
    });

    // Добавляем пользовательские классы
    customClasses.forEach(classObj => {
        const opt = document.createElement("option");
        opt.value = classObj.name;
        opt.textContent = classObj.displayName;
        selector.appendChild(opt);
    });
}

function showClassNameDialog() {
    const container = document.getElementById("class-list-container");
    container.innerHTML = '';

    newClasses.forEach((className, index) => {
        const div = document.createElement("div");
        div.style.marginBottom = "10px";
        div.innerHTML = `
          <label>${className}:</label>
          <input type="text" id="class-name-${index}" value="${className}" placeholder="Введите название для отображения">
        `;
        container.appendChild(div);
    });

    document.getElementById("class-name-dialog").classList.add("show");
    document.getElementById("overlay").classList.add("show");
    document.body.style.overflow = "hidden";
}

function saveClassNames() {
    newClasses.forEach((className, index) => {
        const displayNameInput = document.getElementById(`class-name-${index}`);
        const displayName = displayNameInput ? displayNameInput.value : className;

        customClasses.push({
            name: className,
            displayName: displayName
        });
    });

    // Обновляем селектор классов
    updateClassSelector();

    // Скрываем диалог
    document.getElementById("class-name-dialog").classList.remove("show");
    document.getElementById("overlay").classList.remove("show");
    document.body.style.overflow = "";

    newClasses = []; // Очищаем массив новых классов
}

function saveCSS() {
    const cssContent = document.getElementById("css-editor").value;

    // Извлекаем классы из CSS
    const extractedClasses = extractClassNames(cssContent);

    // Проверяем, есть ли новые классы
    newClasses = extractedClasses.filter(className => {
        return !customClasses.some(classObj => classObj.name === className);
    });

    // Создаем новый элемент стилей вместо перезаписи существующего
    let newStyleElement = document.createElement('style');
    newStyleElement.id = 'dynamic-styles';
    newStyleElement.textContent = cssContent;

    // Заменяем старый элемент новым
    const styleElement = document.getElementById("dynamic-styles");
    if (styleElement) {
        styleElement.parentNode.replaceChild(newStyleElement, styleElement);
    } else {
        document.head.appendChild(newStyleElement);
    }

    if (newClasses.length > 0) {
        // Показываем диалог для ввода названий новых классов
        showClassNameDialog();
    } else {
        showMessage("Стили сохранены!", "success");
        toggleCSSEditor();
    }
}

async function saveDocument() {
    const editor = document.getElementById("editor").cloneNode(true);
    const images = editor.querySelectorAll('img');

    for (const img of images) {
        const serverPath = img.getAttribute('src');
        img.src = serverPath.replace('projects/test1/', '');
    }

    const editorContent = editor.innerHTML;

    const fullHTML = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Мой проект</title>
  <link rel="stylesheet" href="styles/styles.css">
</head>
<body>
  ${editorContent}
  <!-- Подключаем JS файлы -->
  <script src="script.js"></script>
</body>
</html>`;

    // Использование
    const cssContent = await getExternalCSS();

    const response = await fetch('/save-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            html: fullHTML,
            css: cssContent
        })
    });

    const result = await response.json();
    alert(result.message);
}

async function getExternalCSS() {
    const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
    let cssContent = '';

    for (const sheet of stylesheets) {
        try {
            const response = await fetch(sheet.href);
            cssContent += await response.text() + '\n';
        } catch (error) {
            console.error(`Не удалось загрузить ${sheet.href}:`, error);
        }
    }

    return cssContent;
}

function saveDocument2() {
    // Получаем содержимое редактора
    const editorContent = document.getElementById("editor").innerHTML;

    // Получаем содержимое CSS редактора
    const cssContent = document.getElementById("css-editor").value;

    // Создаем HTML документ
    const htmlContent = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Документ WYSIWYG редактора</title>
  <style>
    /* Базовые стили для редактора */
    * {
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      margin: 0;
      padding: 0;
      background-color: #f0f2f5;
      color: #333;
    }

    /* Стили по умолчанию */
    .highlight {
      background-color: #fff3cd;
      padding: 2px 4px;
      border-radius: 3px;
    }

    .code {
      font-family: 'Courier New', monospace;
      background: #f8f9fa;
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid #e9ecef;
    }

    .red-text {
      color: #e74c3c;
    }

    .blue-text {
      color: #3498db;
    }

    .green-text {
      color: #27ae60;
    }

    .large-text {
      font-size: 24px;
    }

    .small-text {
      font-size: 12px;
    }

    /* Стили для специальных выделений */
    .definition {
      background-color: #e3f2fd;
      border-left: 4px solid #2196f3;
      padding: 15px;
      margin: 10px 0;
      border-radius: 0 4px 4px 0;
    }

    .definition::before {
      content: "Определение: ";
      font-weight: bold;
      color: #2196f3;
    }

    .note {
      background-color: #fff8e1;
      border-left: 4px solid #ffc107;
      padding: 15px;
      margin: 10px 0;
      border-radius: 0 4px 4px 0;
    }

    .note::before {
      content: "Примечание: ";
      font-weight: bold;
      color: #ffc107;
    }

    .warning {
      background-color: #ffebee;
      border-left: 4px solid #f44336;
      padding: 15px;
      margin: 10px 0;
      border-radius: 0 4px 4px 0;
    }

    .warning::before {
      content: "Внимание: ";
      font-weight: bold;
      color: #f44336;
    }

    /* Стили для модальных окон */
    .custom-modal {
      position: fixed;
      top: 10%;
      left: 10%;
      width: 80%;
      height: 80%;
      background: white;
      border-radius: 8px;
      box-shadow: 0 5px 30px rgba(0,0,0,0.3);
      z-index: 2000;
      display: none;
      flex-direction: column;
    }

    .custom-modal.show {
      display: flex;
    }

    .modal-header {
      background: #34495e;
      color: white;
      padding: 15px;
      border-radius: 8px 8px 0 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .modal-close {
      background: none;
      border: none;
      color: white;
      font-size: 24px;
      cursor: pointer;
      padding: 0;
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .modal-body {
      flex: 1;
      padding: 20px;
      overflow: auto;
    }

    .modal-footer {
      padding: 15px 20px;
      border-top: 1px solid #eee;
      text-align: right;
    }

    .modal-trigger {
      padding: 5px 10px;
      border: 1px solid #3498db;
      border-radius: 4px;
      background: #3498db;
      color: white;
      cursor: pointer;
      font-size: 14px;
      margin: 0 2px;
    }

    .modal-trigger:hover {
      background: #2980b9;
    }

    .modal-button {
      padding: 10px 20px;
      border: none;
      border-radius: 4px;
      background: #3498db;
      color: white;
      cursor: pointer;
      font-size: 14px;
    }

    .modal-button:hover {
      background: #2980b9;
    }

    /* Пользовательские стили */
    ${cssContent}
  </style>
</head>
<body>
  <div id="editor-content">${editorContent}</div>

  <script>
    // Функция для открытия модального окна
    function openModal(id) {
      const modal = document.getElementById(id);
      if (modal) {
        modal.classList.add("show");
        // Создаем оверлей, если его нет
        let overlay = document.getElementById("modal-overlay");
        if (!overlay) {
          overlay = document.createElement("div");
          overlay.id = "modal-overlay";
          overlay.style.position = "fixed";
          overlay.style.top = "0";
          overlay.style.left = "0";
          overlay.style.width = "100%";
          overlay.style.height = "100%";
          overlay.style.background = "rgba(0,0,0,0.5)";
          overlay.style.zIndex = "1999";
          overlay.onclick = function() {
            const modals = document.querySelectorAll(".custom-modal.show");
            modals.forEach(m => m.classList.remove("show"));
            document.body.removeChild(overlay);
            document.body.style.overflow = "";
          };
          document.body.appendChild(overlay);
        }
        document.body.style.overflow = "hidden";
      }
    }

    // Функция для закрытия модального окна
    function closeModal(id) {
      const modal = document.getElementById(id);
      if (modal) {
        modal.classList.remove("show");
        const overlay = document.getElementById("modal-overlay");
        if (overlay) {
          document.body.removeChild(overlay);
        }
        document.body.style.overflow = "";
      }
    }

    // Назначаем обработчики событий для кнопок модальных окон
    document.addEventListener("DOMContentLoaded", function() {
      const triggers = document.querySelectorAll(".modal-trigger");
      triggers.forEach(trigger => {
        trigger.onclick = function() {
          openModal(this.dataset.modalId);
        };
      });
    });
  <\/script>
</body>
</html>`;

    // Создаем Blob и ссылку для скачивания
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'document.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showMessage("Документ сохранен!", "success");
}

function loadDocument(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const content = e.target.result;

        // Создаем временный элемент для парсинга HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = content;

        // Извлекаем содержимое редактора
        const editorContent = tempDiv.querySelector('#editor-content');
        if (editorContent) {
            document.getElementById("editor").innerHTML = editorContent.innerHTML;
        }

        // Извлекаем CSS стили
        const styleTags = tempDiv.querySelectorAll('style');
        let cssContent = "";
        styleTags.forEach(styleTag => {
            const textContent = styleTag.textContent;
            // Ищем пользовательские стили
            if (textContent.includes("Пользовательские стили")) {
                const userStylesStart = textContent.indexOf("/* Пользовательские стили */");
                if (userStylesStart !== -1) {
                    cssContent = textContent.substring(userStylesStart + 30).trim();
                }
            }
        });

        if (cssContent) {
            document.getElementById("css-editor").value = cssContent;
            // Применяем стили
            let newStyleElement = document.createElement('style');
            newStyleElement.id = 'dynamic-styles';
            newStyleElement.textContent = cssContent;

            const styleElement = document.getElementById("dynamic-styles");
            if (styleElement) {
                styleElement.parentNode.replaceChild(newStyleElement, styleElement);
            } else {
                document.head.appendChild(newStyleElement);
            }
        }

        showMessage("Документ загружен!", "success");

        // Обновляем просмотр кода, если он открыт
        if (isCodeView) {
            updateCodeView();
        }
    };
    reader.readAsText(file);
}

function showMessage(text, type) {
    const message = document.getElementById("message");
    message.textContent = text;
    message.className = "message " + type;

    // Показываем сообщение
    setTimeout(() => {
        message.classList.add("show");
    }, 10);

    // Скрываем через 3 секунды
    setTimeout(() => {
        message.classList.remove("show");
    }, 3000);
}

// Инициализация
document.addEventListener("DOMContentLoaded", function () {
    const editor = document.getElementById("editor");

    // Фокус на редакторе
    editor.focus();

    // Обновляем код при изменениях
    editor.addEventListener("input", function () {
        if (isCodeView) {
            updateCodeView();
        }
    });

    // Обработка горячих клавиш
    editor.addEventListener("keydown", function (e) {
        // Ctrl+B для жирного
        if (e.ctrlKey && e.key === 'b') {
            e.preventDefault();
            document.execCommand('bold', false, null);
        }
        // Ctrl+I для курсива
        if (e.ctrlKey && e.key === 'i') {
            e.preventDefault();
            document.execCommand('italic', false, null);
        }
        // Ctrl+U для подчеркнутого
        if (e.ctrlKey && e.key === 'u') {
            e.preventDefault();
            document.execCommand('underline', false, null);
        }
        // Enter в диалоге модального окна
        if (e.key === 'Enter' && document.getElementById("modal-dialog").classList.contains("show")) {
            e.preventDefault();
            createModal();
        }
    });

    // Закрытие диалогов по Escape
    document.addEventListener("keydown", function (e) {
        if (e.key === 'Escape') {
            closeAllDialogs();
        }
    });
});
// Функции для работы со списками
function insertList(type) {
    const selection = window.getSelection();
    if (!selection.toString().trim()) {
        // Если ничего не выделено, создаем пустой список
        const range = selection.getRangeAt(0);
        const list = document.createElement(type);
        const listItem = document.createElement('li');
        listItem.textContent = 'Новый пункт';
        list.appendChild(listItem);

        // Вставляем список
        range.deleteContents();
        range.insertNode(list);

        // Устанавливаем курсор в новый пункт
        const newRange = document.createRange();
        newRange.selectNodeContents(listItem);
        newRange.collapse(false);
        selection.removeAllRanges();
        selection.addRange(newRange);
    } else {
        // Если выделен текст, преобразуем его в список
        const range = selection.getRangeAt(0);
        const list = document.createElement(type);

        // Получаем выделенный текст
        const selectedText = selection.toString();
        const lines = selectedText.split('\n');

        // Создаем пункты списка
        lines.forEach(line => {
            if (line.trim()) {
                const listItem = document.createElement('li');
                listItem.textContent = line.trim();
                list.appendChild(listItem);
            }
        });

        // Если список пустой, добавляем один пункт
        if (list.children.length === 0) {
            const listItem = document.createElement('li');
            listItem.textContent = 'Новый пункт';
            list.appendChild(listItem);
        }

        // Заменяем выделение на список
        range.deleteContents();
        range.insertNode(list);

        // Устанавливаем курсор после списка
        const newRange = document.createRange();
        newRange.setStartAfter(list);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
    }

    showMessage(`Список создан!`, "success");
    if (isCodeView) {
        updateCodeView();
    }
}

function indentList() {
    document.execCommand('indent', false, null);
    if (isCodeView) {
        updateCodeView();
    }
}

function outdentList() {
    document.execCommand('outdent', false, null);
    if (isCodeView) {
        updateCodeView();
    }
}