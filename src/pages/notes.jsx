
import Tiptap from '../components/Tiptap.jsx';
import React, { useState, useCallback, useEffect } from 'react';
import '/src/index.css';
import IconButton from '@mui/material/IconButton';
import DeleteIcon from '@mui/icons-material/Delete';
import {
    Dialog,
    DialogTitle,
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    TextField,
} from '@mui/material';

const NotesPage = () => {
    const [filePath, setFilePath] = useState(null);
    const [content, setContent] = useState(null);
    const [isSaved, setIsSaved] = useState(true);
    const [noteFiles, setNoteFiles] = useState([]);
    const [noteTitle, setNoteTitle] = useState('');
    const [editorInstance, setEditorInstance] = useState(null);
    const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [folders, setFolders] = useState([]);
    const [currentFolder, setCurrentFolder] = useState(null);
    const [currentNoteId, setCurrentNoteId] = useState(null);

    const clearEditor = () => {
        setFilePath(null);
        setContent(null);
        setNoteTitle('');
        setCurrentNoteId(null);
    };

    const loadFolders = async () => {
        const folderList = await window.api.getFolders();
        setFolders(folderList);
        if (folderList.length > 0 && !folderList.includes(currentFolder)) {
            setCurrentFolder(folderList[0]);
        } else if (folderList.length === 0) {
            setCurrentFolder(null);
        }
    };

    const loadNotes = async (folderName) => {
        if (!folderName) {
            setNoteFiles([]);
            return;
        }
        const files = await window.api.getNotesInFolder(folderName);
        setNoteFiles(files);
    };

    useEffect(() => {
        loadFolders();
    }, []);

    useEffect(() => {
        loadNotes(currentFolder);
        clearEditor();
    }, [currentFolder]);

    const handleOpenFile = async (fileName) => {
        // The main process will construct the full path
        if (!currentFolder) return;
        const result = await window.api.readNoteFile(currentFolder, fileName);
        if (result) {
            setNoteTitle(fileName);
            setFilePath(result.filePath);
            try {
                const parsedContent = JSON.parse(result.content);
                setCurrentNoteId(parsedContent.id);
                const { id, ...tiptapContent } = parsedContent;
                setContent(tiptapContent);
            } catch (error) {
                console.warn("File content is not valid JSON. Treating as plain text.", error);
                setContent({
                    type: 'doc',
                    content: [{
                        type: 'paragraph',
                        ...(result.content && { content: [{ type: 'text', text: result.content }] }),
                    }],
                });
                setCurrentNoteId(null);
            }
            setIsSaved(true);
        }
    };

    useEffect(() => {
        // Don't save if there's no file path or if content is null (initial state).
        if (!filePath || content === null) {
            return;
        }

        const handler = setTimeout(async () => {
            const contentToSave = {
                id: currentNoteId,
                ...content,
            };
            const contentString = JSON.stringify(contentToSave, null, 2);
            const result = await window.api.saveFile(filePath, contentString);
            if (result.success) {
                setIsSaved(true);
            } else {
                // If saving fails, show an error and don't pretend it's saved.
                alert(`Failed to save note: ${result.error}`);
                setIsSaved(false);
            }
        }, 400); // Wait x after the user stops typing to save.

        // This cleanup functio runs before the next effect or on unmount.
        // It clears the timeout, preventing the save if the content changes again quickly.
        return () => clearTimeout(handler);
    }, [content, filePath]);

     // Debounced rename when the title changes
     useEffect(() => {
        if (!filePath || !noteTitle) {
            return;
        }

        // This is a simple way to get the filename without the extension
        // It's safer than using path manipulation in the renderer.
        const pathParts = filePath.replace(/\\/g, '/').split('/');
        const currentFileName = pathParts[pathParts.length - 1].replace(/\.json$/, '');

        if (noteTitle === currentFileName) {
            return; 
        }

        const handler = setTimeout(async () => {
            setIsSaved(false);
            const result = await window.api.renameNote(filePath, noteTitle);
            if (result.success) {
                setFilePath(result.filePath);
                setNoteTitle(result.newFileName);
                await loadNotes(currentFolder);
                setIsSaved(true);
            } else {
                alert(`Error renaming note: ${result.error}`);
                setNoteTitle(currentFileName); // Revert to the old title
            }
        }, 500); // Debounce for 500ms

        return () => clearTimeout(handler);
    }, [noteTitle, filePath]);


    const handleContentUpdate = useCallback((newContent) => {
        // This function now only updates the local state.
        // The useEffect hook will handle the saving
        setIsSaved(false);
        setContent(newContent);
    }, []);   
    
    const handleOpenLinkModal = () => {
        if (editorInstance && !editorInstance.state.selection.empty) {
            setSearchTerm('');
            setIsLinkModalOpen(true);
        }
    };

    const handleSetNoteLink = (targetNoteId) => {
        if (editorInstance) {
           
            editorInstance
                .chain()
                .focus()
                .extendMarkRange('noteLink')
                .setNoteLink({ noteId: targetNoteId })
                .run();
        }
        setIsLinkModalOpen(false);
    };

    const handleNoteLinkNavigation = (noteId) => {
        const targetNote = noteFiles.find(note => note.id === noteId);
        if (targetNote) {
            handleOpenFile(targetNote.title);
        } else {
            alert("The linked note could not be found. It may have been deleted.");
        }
    };

    const handleNewFolder = async () => {
        const folderName = "New Folder";
        const result = await window.api.createFolder(folderName);
        if (result.success) {
            await loadFolders();
            setCurrentFolder(result.folderName);
        } else {
            alert(`Error creating folder: ${result.error}`);
        }
    };

    const handleNewNote = async () => {
        if (!currentFolder) {
            alert("Please select a folder first.");
            return;
        }
        const title = "Untitled Note";
        const result = await window.api.createNote(currentFolder, title);
        if (result.success) {
            await loadNotes(currentFolder);
            handleOpenFile(result.fileName);
        } else {
            alert(`Error creating note: ${result.error}`);
        }
    };

    const handleDeleteNote = async (fileName) => {
        if (!currentFolder) return;
        const isConfirmed = window.confirm(`Are you sure you want to delete "${fileName}"?`);
        if (isConfirmed) {
            const wasActiveNote = noteTitle === fileName;
            const deleteResult = await window.api.deleteNote(currentFolder, fileName);

            if (deleteResult.success) {
                const updatedNotes = await window.api.getNotesInFolder(currentFolder);
                setNoteFiles(updatedNotes);

                if (wasActiveNote) {
                    if (updatedNotes.length > 0) {
                        // Open the first note in the new list
                        handleOpenFile(updatedNotes[0].title);
                    } else {
                        // No files left, so clear the editor
                        clearEditor();
                    }
                }
            } else {
                alert(`Error deleting note: ${deleteResult.error}`);
            }
        }
    };
    
        

        


    return (
        <div className="notes-layout">
            <aside className="notes-sidebar">
            <div className="sidebar-section">
                    <div className="sidebar-header">
                        <h2>Folders</h2>
                        <div className="sidebar-actions">
                            <button onClick={handleNewFolder} title="New Folder">+</button>
                            <button onClick={() => window.api.openNotesFolder()} title="Open Root Notes Folder">📂</button>
                        </div>
                    </div>
                    <div className="folder-list">
                        {folders.map(folder => (
                            <div key={folder} className={`folder-item ${currentFolder === folder ? 'active' : ''}`} onClick={() => setCurrentFolder(folder)}>
                                {folder}
                            </div>
                        ))}
                    </div>
                </div>
                {currentFolder && (
                    <div className="sidebar-section" style={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <div className="sidebar-header">
                            <h2>Notes in {currentFolder}</h2>
                            <div className="sidebar-actions">
                                <button onClick={handleNewNote} title="New Note">+</button>
                            </div>
                            </div>
                        <div className="note-files-list">
                            {noteFiles.map((note) => (
                                <div key={note.id} className={`note-file-item ${note.title === noteTitle ? 'active' : ''}`}>
                                    <div className="note-file-item-opener" onClick={() => handleOpenFile(note.title)} title={note.title}>
                                        {note.title}
                                    </div>
                                    <div>
                                    <IconButton onClick={() => handleDeleteNote(note.title)} title={`Delete ${note.title}`}><DeleteIcon /></IconButton>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                <div className="file-status-panel">
                    {filePath && (
                        <div className="file-info">
                            <strong>Editing:</strong>
                            <p>{filePath}</p>
                            <p className={isSaved ? 'status-saved' : 'status-unsaved'}>
                                {isSaved ? 'Saved' : 'Unsaved'}
                            </p>
                        </div>
                    )}
                </div>
            </aside>
            <main className="notes-main-content">
                <div className="note-editor-panel">
                    {filePath && (
                        <input
                            type="text"
                            className="note-title-input"
                            value={noteTitle}
                            onChange={(e) => setNoteTitle(e.target.value)}
                            placeholder="Note Title"
                        />
                    )}
                    <Tiptap
                        content={content}
                        onUpdate={handleContentUpdate}
                        onEditorCreated={setEditorInstance}
                        onNoteLinkClick={handleNoteLinkNavigation}
                        onLinkButtonClick={handleOpenLinkModal}
                    />
                </div>
            </main>
            <Dialog onClose={() => setIsLinkModalOpen(false)} open={isLinkModalOpen} fullWidth maxWidth="xs">
                <DialogTitle>Link to another note</DialogTitle>
                <TextField
                    label="Search notes"
                    variant="outlined"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ margin: '0 16px 16px 16px' }}
                    autoFocus
                />
                <List sx={{ pt: 0, maxHeight: '40vh', overflow: 'auto' }}>
                    {noteFiles
                        .filter(note => note.title.toLowerCase().includes(searchTerm.toLowerCase()) && note.title !== noteTitle)
                        .map((note) => (
                            <ListItem disableGutters key={note.id}>
                                <ListItemButton onClick={() => handleSetNoteLink(note.id)}>
                                    <ListItemText primary={note.title} />
                                </ListItemButton>
                            </ListItem>
                        ))}
                </List>
            </Dialog>

        </div>
    );
};

export default NotesPage;