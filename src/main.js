import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import started from 'electron-squirrel-startup';
import { v4 as uuidv4 } from 'uuid';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

const notesPath = path.join(app.getPath('userData'), 'notes');
if (!fs.existsSync(notesPath)) {
  fs.mkdirSync(notesPath, { recursive: true });
}

ipcMain.handle('notes:getFiles', async () => {
  try{
    const fileNames = fs.readdirSync(notesPath).filter(file => file.endsWith('.json'));
    const notesData = fileNames.map(fileName => {
    const filePath = path.join(notesPath, fileName);
    const title = fileName.replace(/\.json$/, '');
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        let data = JSON.parse(content);

        // On-the-fly migration for old notes without IDs
        if (!data.id) {
          data.id = uuidv4();
          fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        }
        return { id: data.id, title };
      } catch (e) {
        // If file is malformed or empty, we can't get an ID. Skip it.
        console.error(`Could not read or parse ${fileName}:`, e);
        return null;
      }
    });
    // Filter out any nulls from failed reads
    return notesData.filter(note => note !== null);
  }catch(err){
    console.error('Failed to read notes directory', err);
    return[];
  }
});

ipcMain.handle('notes:deleteFile', async (event, fileName) => {
  const filePath = path.join(notesPath, `${fileName}.json`);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return { success: true };
    }
    return { success: false, error: 'File not found.' };
  } catch (err) {
    console.error(`Failed to delete note file: ${filePath}`, err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('notes:renameFile', async (event, oldFilePath, newTitle) => {
  if (!newTitle || typeof newTitle !== 'string' || newTitle.trim().length === 0) {
    return { success: false, error: 'Invalid title provided.' };
  }

  const oldTitle = path.basename(oldFilePath, '.json');
  if (oldTitle === newTitle) {
    return { success: true, filePath: oldFilePath, newFileName: oldTitle }; // No change needed
  }

  // Sanitize the new title to create a valid filename
  const sanitizedTitle = newTitle.replace(/[\\/:*?"<>|]/g, '');
  let newFileName = sanitizedTitle;
  let newFilePath = path.join(notesPath, `${newFileName}.json`);
  let counter = 1;

  // Ensure the new filename is unique by appending a number if it already exists
  while (fs.existsSync(newFilePath)) {
    newFileName = `${sanitizedTitle} (${counter})`;
    newFilePath = path.join(notesPath, `${newFileName}.json`);
    counter++;
  }

  try {
    fs.renameSync(oldFilePath, newFilePath);
    return { success: true, filePath: newFilePath, newFileName: newFileName };
  } catch (err) {
    console.error(`Failed to rename note from ${oldFilePath} to ${newFilePath}:`, err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('notes:readFile', async (event, fileName) => {
  const filePath = path.join(notesPath, `${fileName}.json`);
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { filePath, content };
  } catch (err) {
    console.error('Failed to read file:', err);
    return null;
  }
});

ipcMain.handle('notes:openFolder', () => {
  shell.openPath(notesPath);
});

ipcMain.handle('notes:createFile', async (event, title) => {
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return { success: false, error: 'Invalid title provided.' };
  }
    // Sanitize filename to remove invalid characters
    const sanitizedTitle = title.replace(/[\\/:*?"<>|]/g, '');
    let newFileName = sanitizedTitle;
    let newFilePath = path.join(notesPath, `${newFileName}.json`);
    let counter = 1;
    
    // Ensure filename is unique by appending a number if it exists
    while (fs.existsSync(newFilePath)) {
      newFileName = `${sanitizedTitle} (${counter})`;
      newFilePath = path.join(notesPath, `${newFileName}.json`);
      counter++;
    }
    try {
      const noteId = uuidv4();
      // Create an empty note file with a valid Tiptap/ProseMirror structure
      const initialContent = { id: noteId, type: 'doc', content: [{ type: 'paragraph' }] };
      fs.writeFileSync(newFilePath, JSON.stringify(initialContent, null, 2));
      // Return the name (without extension) and the full path
      return { success: true, fileName: newFileName, filePath: newFilePath };
  } catch (err) {
    console.error('Failed to create new note file:', err);
    return { success: false, error: err.message };
  }

});



ipcMain.on('file:save', (event, filePath, content) => {
  fs.writeFileSync(filePath, content);
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

