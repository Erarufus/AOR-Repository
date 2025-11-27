import { Mark, mergeAttributes } from '@tiptap/core';

/**
 * A custom mark for creating internal links between notes.
 * It renders as a <span> with a data-attribute to hold the target note's ID.
 */
export const NoteLink = Mark.create({
  name: 'noteLink',

  addAttributes() {
    return {
      noteId: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-note-link]',
        getAttrs: element => ({
          noteId: element.getAttribute('data-note-link'),
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    // We render a span with a specific class and data-attribute.
    // The click handling will be managed by the editor's props.
    return ['span', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { 'data-note-link': HTMLAttributes.noteId, class: 'note-link' }), 0];
  },

  addCommands() {
    return {
      setNoteLink: (attributes) => ({ commands }) => commands.setMark(this.name, attributes),
      unsetNoteLink: () => ({ commands }) => commands.unsetMark(this.name),
    };
  },
});

