import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { useState, useCallback } from 'react';
import { Excalidraw, exportToSvg } from '@excalidraw/excalidraw';

const ExcalidrawNodeView = (props: any) => {
  const { node, updateAttributes } = props;
  const [isEditing, setIsEditing] = useState(node.attrs.data === null);
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);

  const handleSave = useCallback(async () => {
    if (!excalidrawAPI) return;
    const elements = excalidrawAPI.getSceneElements();
    const appState = excalidrawAPI.getAppState();
    
    // Save the raw data
    updateAttributes({
      data: {
        elements,
        appState: {
          viewBackgroundColor: appState.viewBackgroundColor,
        }
      }
    });

    try {
      // Create a preview SVG
      const svg = await exportToSvg({
        elements,
        appState: {
          ...appState,
          exportBackground: true,
          exportWithDarkMode: true
        }
      });
      // Convert SVG to data URL for display
      const serializer = new XMLSerializer();
      let svgStr = serializer.serializeToString(svg);
      const encodedData = window.btoa(unescape(encodeURIComponent(svgStr)));
      updateAttributes({ preview: `data:image/svg+xml;base64,${encodedData}` });
    } catch (e) {
      console.error('Failed to export excalidraw to SVG preview', e);
    }
    
    setIsEditing(false);
  }, [excalidrawAPI, updateAttributes]);

  return (
    <NodeViewWrapper className="my-4 excalidraw-component relative border border-border rounded-lg overflow-hidden bg-zinc-900/50">
      {isEditing ? (
        <div className="h-[500px] w-full relative">
          <Excalidraw
            excalidrawAPI={(api) => setExcalidrawAPI(api)}
            initialData={node.attrs.data || undefined}
            theme="dark"
          />
          <div className="absolute top-4 right-4 z-50 flex gap-2">
            <button 
              onClick={handleSave}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 shadow-lg"
            >
              Save Canvas
            </button>
            <button 
              onClick={() => {
                if (!node.attrs.data) props.deleteNode();
                else setIsEditing(false);
              }}
              className="bg-destructive/90 text-destructive-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-destructive shadow-lg"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div 
          className="cursor-pointer group relative flex items-center justify-center p-4 bg-zinc-950 min-h-[100px]"
          onClick={() => setIsEditing(true)}
        >
          {node.attrs.preview ? (
            <img src={node.attrs.preview} alt="Excalidraw Canvas" className="max-w-full rounded" />
          ) : (
            <div className="text-muted-foreground">Click to edit canvas</div>
          )}
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span className="bg-white/10 text-white px-4 py-2 rounded-md backdrop-blur-sm text-sm font-medium">
              Click to Edit Canvas
            </span>
          </div>
        </div>
      )}
    </NodeViewWrapper>
  );
};

export const ExcalidrawExtension = Node.create({
  name: 'excalidraw',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      data: {
        default: null,
      },
      preview: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="excalidraw"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'excalidraw' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ExcalidrawNodeView);
  },
});
