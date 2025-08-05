const http = require('http');
const fs = require('fs-extra');
const PORT = 8080;

const express = require('express');
const multer = require('multer');
const archiver = require('archiver');

const path = require('path');
const app = express();


app.use(express.static('public'));
app.use(express.static('temp'))
app.use('/projects', express.static('projects'));
app.use(express.json());

const PROJECTS_DIR = path.join('projects');

let currentProject = null; // Текущий выбранный проект

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!currentProject) {
      return cb(new Error('No project selected'));
    }
    const uploadPath = path.join(PROJECTS_DIR, currentProject, 'images');

    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }


    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uploadPath = path.join(PROJECTS_DIR, currentProject, 'images');
    const files = fs.readdirSync(uploadPath);
    const nextNumber = files.length + 1;
    const extension = path.extname(file.originalname).toLowerCase();

    const name = "img-" + nextNumber + extension;
    cb(null, name);
  }
});

const upload = multer({ storage: storage });

// http://localhost:8080/
app.get('/', function (req, res) {
  res.sendFile('index.html');
});

app.post('/upload', upload.single('file'), (req, res) => {

  if (!currentProject) {
    return res.status(400).json({ error: "Не выбран проект" });
  }

  if (!req.file) {
    return res.status(400).send('Файл не загружен');
  }

  const filePath = path.join(PROJECTS_DIR, currentProject, 'images', req.file.filename);

  res.json({
    fileName: req.file.originalname,
    filePath: filePath
  });
});

app.post('/createproject', (req, res) => {
  const { projectName } = req.body;

  if (!projectName) {
    return res.status(400).json({ error: 'Project name is required' });
  }

  const projectPath = path.join(PROJECTS_DIR, projectName);

  if (fs.existsSync(projectPath)) {
    return res.status(400).json({ error: 'Project already exists' });
  }

  fs.mkdirSync(projectPath);

  res.json({ success: true, message: `Project "${projectName}" created` });
});

app.get('/projects', (req, res) => {
  const projects = fs.readdirSync(PROJECTS_DIR).filter(file => {
    return fs.statSync(path.join(PROJECTS_DIR, file)).isDirectory();
  });

  res.json({ projects });
});

app.get('/current_project', (req, res) => {
  res.json({ success: true, project: currentProject });
});

app.post('/selectproject', async (req, res) => {
  const { projectName } = req.body;

  if (!fs.existsSync(path.join(PROJECTS_DIR, projectName))) {
    return res.status(404).json({ error: 'Project not found' });
  }

  currentProject = projectName;

  const htmlPath = path.join(PROJECTS_DIR, currentProject, 'index.html');
  const htmlContent = await fs.readFile(htmlPath, 'utf-8');

  res.json({
    success: true, message: `Project "${projectName}" selected`,
    htmlContent: htmlContent
  });
});

app.post('/save-project', (req, res) => {
  const { html, css } = req.body;

  if (!currentProject) {
    return res.status(400).json({ error: "Не выбран проект" });
  }

  const projectPath = path.join(PROJECTS_DIR, currentProject);

  if (!fs.existsSync(projectPath)) {
    fs.mkdirSync(projectPath, { recursive: true });
  }

  const stylesPath = path.join(projectPath, 'styles');

  if (!fs.existsSync(stylesPath)) {
    fs.mkdirSync(stylesPath, { recursive: true });
  }

  fs.writeFileSync(path.join(projectPath, 'index.html'), html);

  if (css) {
    const cssPath = path.join(stylesPath, 'styles.css');
    fs.writeFileSync(cssPath, css);
  }

  res.json({
    success: true,
    message: 'Проект сохранен',
    path: `/projects/${projectPath}/index.html`
  });

});

app.post('/export', async (req, res) => {
  const { html, css } = req.body;

  if (!currentProject) {
    return res.status(400).json({ error: "Не выбран проект" });
  }

  const tempFolder = path.join(__dirname, 'temp');

  if (!fs.existsSync(tempFolder)) {
    fs.mkdirSync(tempFolder, { recursive: true });
  }

  const tempDir = path.join(tempFolder, `site-${Date.now()}`);

  const projectPath = path.join(tempDir, currentProject);

  if (!fs.existsSync(projectPath)) {
    fs.mkdirSync(projectPath, { recursive: true });
  }

  const stylesPath = path.join(projectPath, 'styles');

  if (!fs.existsSync(stylesPath)) {
    fs.mkdirSync(stylesPath, { recursive: true });
  }

  fs.writeFileSync(path.join(projectPath, 'index.html'), html);

  if (css) {
    const cssPath = path.join(stylesPath, 'styles.css');
    fs.writeFileSync(cssPath, css);
  }

  const sourceDir = path.join(PROJECTS_DIR, currentProject, 'images');
  const destinationDir = path.join(projectPath, 'images');

  await moveAllFiles(sourceDir, destinationDir);

  const zipName = `temp-${Date.now()}.zip`;
  const zipPath = path.join(__dirname, 'temp', zipName);
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip');

  output.on('close', () => {
    res.download(zipPath, (err) => {
      if (err) {
        console.error('Ошибка при скачивании:', err);
      }

      // Удаляем временные файлы после отправки
      //fs.unlinkSync(filePath);
      // fs.unlinkSync(zipPath);
    });
  });

  archive.on('error', (err) => {
    console.log(err)

  });

  archive.pipe(output);
  archive.directory(projectPath, false);
  archive.finalize();
});

async function moveAllFiles(sourceDir, destinationDir) {
  try {
    await fs.ensureDir(destinationDir); // Создаём папку, если её нет
    const files = await fs.readdir(sourceDir);

    for (const file of files) {
      const sourcePath = path.join(sourceDir, file);
      const destinationPath = path.join(destinationDir, file);

      await fs.move(sourcePath, destinationPath);
    }
  } catch (err) {
    console.error('Ошибка:', err);
  }
}

app.listen(PORT);

console.log('Сервер запущен!');