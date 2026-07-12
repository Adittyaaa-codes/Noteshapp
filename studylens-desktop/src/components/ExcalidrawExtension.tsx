import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { useState, useCallback, useEffect } from 'react';
import { Excalidraw, exportToSvg } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { PenTool, Trash2 } from 'lucide-react';
import { createPortal } from 'react-dom';

// ── Full-screen Modal rendered via Portal (completely outside ProseMirror DOM) ──
function ExcalidrawModal({
  initialData,
  onSave,
  onClose,
}: {
  initialData: any;
  onSave: (data: any, preview: string) => void;
  onClose: () => void;
}) {
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSave = useCallback(async () => {
    if (!excalidrawAPI) return;
    setSaving(true);
    const elements = excalidrawAPI.getSceneElements();
    const appState = excalidrawAPI.getAppState();

    const data = {
      elements,
      appState: { viewBackgroundColor: appState.viewBackgroundColor },
    };

    let preview = '';
    try {
      const svg = await exportToSvg({
        elements,
        appState: { ...appState, exportBackground: true, exportWithDarkMode: true },
        files: excalidrawAPI.getFiles(),
      });
      const serializer = new XMLSerializer();
      const svgStr = serializer.serializeToString(svg);
      preview = `data:image/svg+xml;base64,${window.btoa(unescape(encodeURIComponent(svgStr)))}`;
    } catch (e) {
      console.error('SVG export failed:', e);
    }

    onSave(data, preview);
    setSaving(false);
  }, [excalidrawAPI, onSave]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-[#1e1e1e]"
      style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b shrink-0"
        style={{ borderColor: '#2f2f2f', background: '#191919' }}
      >
        <div className="flex items-center gap-2">
          <PenTool size={14} style={{ color: '#9b9a97' }} />
          <span style={{ fontSize: 13, fontWeight: 500, color: '#9b9a97', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Canvas
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            style={{
              padding: '5px 14px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              color: '#9b9a97',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              transition: 'background 150ms',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '5px 16px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              color: '#ffffff',
              background: '#2eaadc',
              border: 'none',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
              transition: 'opacity 150ms',
            }}
          >
            {saving ? 'Saving…' : 'Save & Close'}
          </button>
        </div>
      </div>

      {/* Excalidraw fills all remaining space */}
      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        <Excalidraw
          excalidrawAPI={(api) => setExcalidrawAPI(api)}
          initialData={initialData || undefined}
          theme="dark"
        />
      </div>
    </div>,
    document.body
  );
}

// ── Tiptap NodeView ────────────────────────────────────────────────────────────
const ExcalidrawNodeView = (props: any) => {
  const { node, updateAttributes } = props;
  const [isOpen, setIsOpen] = useState(node.attrs.data === null);

  const handleSave = useCallback(
    (data: any, preview: string) => {
      updateAttributes({ data, preview });
      setIsOpen(false);
    },
    [updateAttributes]
  );

  const handleClose = useCallback(() => {
    // If no data was ever saved, delete the node
    if (!node.attrs.data) props.deleteNode();
    else setIsOpen(false);
  }, [node.attrs.data, props]);

  return (
    <NodeViewWrapper className="my-6" contentEditable={false}>
      {/* Preview card */}
      <div
        className="group relative overflow-hidden rounded-xl border cursor-pointer select-none"
        style={{ background: '#111', borderColor: '#2f2f2f', minHeight: 120 }}
        onClick={() => setIsOpen(true)}
      >
        {node.attrs.preview ? (
          <img
            src={node.attrs.preview}
            alt="Drawing"
            style={{ display: 'block', width: '100%', borderRadius: 10 }}
          />
        ) : (
          <div
            className="flex flex-col items-center justify-center gap-2 py-10"
            style={{ color: '#555' }}
          >
            <PenTool size={22} />
            <span style={{ fontSize: 13, fontWeight: 500 }}>Empty Canvas — click to draw</span>
          </div>
        )}

        {/* Delete button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            props.deleteNode();
          }}
          className="absolute top-2 right-2 p-1.5 rounded-md bg-black/40 text-muted-foreground hover:bg-red-500 hover:text-white opacity-0 group-hover:opacity-100 transition-all z-10 backdrop-blur-sm shadow-sm"
          title="Delete Canvas"
        >
          <Trash2 size={16} />
        </button>

        {/* Hover overlay */}
        <div
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}
        >
          <span
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              background: '#2eaadc',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            }}
          >
            Edit Canvas
          </span>
        </div>
      </div>

      {/* Full-screen modal, only rendered when open */}
      {isOpen && (
        <ExcalidrawModal
          initialData={node.attrs.data}
          onSave={handleSave}
          onClose={handleClose}
        />
      )}
    </NodeViewWrapper>
  );
};

// ── Tiptap Extension ───────────────────────────────────────────────────────────
export const ExcalidrawExtension = Node.create({
  name: 'excalidraw',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      data: { default: null },
      preview: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="excalidraw"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'excalidraw' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ExcalidrawNodeView);
  },
});
