
import Tiptap from '../components/Tiptap.jsx';
import React, { useState, useCallback, useEffect } from 'react';
import '/src/index.css';

const NotesPage = () => {
    const [filePath, setFilePath] = useState(null);
    const [content, setContent] = useState(null);
    const [isSaved, setIsSaved] = useState(true);

    const handleOpenFile = async () => {
        const result = await window.api.openFile();
        if (result) {
            setFilePath(result.filePath);
            try {
                // We save notes as JSON, so we try to parse it.
                const parsedContent = JSON.parse(result.content);
                setContent(parsedContent);
            } catch (e) {
                // If it's not JSON we treat it as plain text.
                console.warn("File content is not valid JSON. Treating as plain text.");
                setContent({
                    type: 'doc',
                    content: [{
                        type: 'paragraph',
                        ...(result.content && { content: [{ type: 'text', text: result.content }] }),
                    }],
                });
            }
            setIsSaved(true);
        }
    };

    useEffect(() => {
        // Don't save if there's no file path or if content is null (initial state).
        if (!filePath || content === null) {
            return;
        }

        const handler = setTimeout(() => {
            const contentString = JSON.stringify(content, null, 2);
            window.api.saveFile(filePath, contentString);
            setIsSaved(true);
        }, 400); // Wait x after the user stops typing to save.

        // This cleanup function runs before the next effect or on unmount.
        // It clears the timeout, preventing the save if the content changes again quickly.
        return () => clearTimeout(handler);
    }, [content, filePath]);


    const handleContentUpdate = useCallback((newContent) => {
        // This function now only updates the local state.
        // The useEffect hook will handle the saving
        setIsSaved(false);
        setContent(newContent);
    }, []);    

        


    return (
        <div className="notes-layout">
            <aside className="notes-sidebar">
                <div className="note-editor-panel">
                    <h2>Controls</h2>
                    <button onClick={handleOpenFile}>Open File</button>
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
                    <Tiptap content={content} onUpdate={handleContentUpdate} />
                </div>
            </main>

        </div>
    );
};

export default NotesPage;