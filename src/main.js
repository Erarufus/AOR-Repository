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

/**
 * Generates a unique path for a file or folder by appending a number if the path already exists.
 * @param {string} directory The directory where the item should be.
 * @param {string} name The desired name for the item.
 * @param {string|null} extension The file extension (or null for a directory).
 * @returns {{uniqueName: string, uniquePath: string}}
 */
function getUniquePath(directory, name, extension = null) {
  let uniqueName = name;
  let uniquePath = path.join(directory, extension ? `${uniqueName}.${extension}` : uniqueName);
  let counter = 1;
  while (fs.existsSync(uniquePath)) {
    uniqueName = `${name} (${counter})`;
    uniquePath = path.join(directory, extension ? `${uniqueName}.${extension}` : uniqueName);
    counter++;
  }
  return { uniqueName, uniquePath };
}


ipcMain.handle('notes:getFolders', async () => {
  try {
    const dirents = fs.readdirSync(notesPath, { withFileTypes: true });
    return dirents
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
  } catch (err) {
    console.error('Failed to read folders from notes directory:', err);
    return [];
  }
});

ipcMain.handle('notes:getNotesInFolder', async (event, folderName) => {
  const folderPath = path.join(notesPath, folderName);
  try {
    if (!fs.existsSync(folderPath)) {
      return [];
    }
    const fileNames = fs.readdirSync(folderPath).filter(file => file.endsWith('.json'));
    const notesData = fileNames.map(fileName => {
      const filePath = path.join(folderPath, fileName);
      const title = fileName.replace(/\.json$/, '');
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        let data = JSON.parse(content);
        if (!data.id) {
          data.id = uuidv4();
          fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        }
        return { id: data.id, title };
      } catch (e) {
        console.error(`Could not read or parse ${fileName} in ${folderName}:`, e);
        return null;
      }
    });
    return notesData.filter(note => note !== null);
  } catch (err) {
    console.error(`Failed to read notes from ${folderName}:`, err);
    return [];
  }
});

ipcMain.handle('notes:createFolder', async (event, folderName) => {
  if (!folderName || typeof folderName !== 'string' || folderName.trim().length === 0) {
    return { success: false, error: 'Invalid folder name.' };
  }
  const sanitizedName = folderName.replace(/[\\/:*?"<>|]/g, '');
  const { uniqueName, uniquePath: newFolderPath } = getUniquePath(notesPath, sanitizedName);
  try {
    fs.mkdirSync(newFolderPath);
    return { success: true, folderName: uniqueName };
  } catch (err) {
    console.error('Failed to create new folder:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('notes:deleteFile', async (event, folderName, fileName) => {
  const filePath = path.join(notesPath, folderName, `${fileName}.json`);
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

  const folderPath = path.dirname(oldFilePath);

  // Sanitize the new title to create a valid filename
  const sanitizedTitle = newTitle.replace(/[\\/:*?"<>|]/g, '');
  const { uniqueName: newFileName, uniquePath: newFilePath } = getUniquePath(folderPath, sanitizedTitle, 'json');

  try {
    fs.renameSync(oldFilePath, newFilePath);
    return { success: true, filePath: newFilePath, newFileName: newFileName };
  } catch (err) {
    console.error(`Failed to rename note from ${oldFilePath} to ${newFilePath}:`, err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('notes:readFile', async (event, folderName, fileName) => {
  const filePath = path.join(notesPath, folderName, `${fileName}.json`);
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

ipcMain.handle('notes:createFile', async (event, folderName, title) => {
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return { success: false, error: 'Invalid title provided.' };
  }
  const folderPath = path.join(notesPath, folderName);
  // Sanitize filename to remove invalid characters
  const sanitizedTitle = title.replace(/[\\/:*?"<>|]/g, '');
  const { uniqueName: newFileName, uniquePath: newFilePath } = getUniquePath(folderPath, sanitizedTitle, 'json');
  try {
    const noteId = uuidv4();
    const initialContent = { id: noteId, type: 'doc', content: [{ type: 'paragraph' }] };
    fs.writeFileSync(newFilePath, JSON.stringify(initialContent, null, 2));
    return { success: true, fileName: newFileName, filePath: newFilePath };
  } catch (err) {
    console.error('Failed to create new note file:', err);
    return { success: false, error: err.message };
  }

});



ipcMain.handle('notes:saveFile', (event, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content);
    return { success: true };
  } catch (err) {
    console.error('Failed to save file:', err);
    return { success: false, error: err.message };
  }
});


app.whenReady().then(() => {
  createWindow();

  // On OS X i
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. 
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

