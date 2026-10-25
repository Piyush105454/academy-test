import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bold, Italic, Underline, List, ListOrdered, ChevronDown,
  AlignLeft, AlignCenter, AlignRight, Link2, Image as ImageIcon,
  Strikethrough, Code, Quote, Minus, Highlighter, Palette,
  Undo2, Redo2, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
}

const FONT_COLORS = [
  '#000000', '#dc2626', '#d97706', '#16a34a', '#2563eb', '#7c3aed', '#db2777',
  '#6b7280', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899',
];

const HIGHLIGHT_COLORS = [
  '#fef08a', '#fed7aa', '#bbf7d0', '#bfdbfe', '#e9d5ff', '#fecdd3', '#e0f2fe', '#f3f4f6',
];

export function RichTextEditor({ value, onChange, placeholder, minHeight = '200px' }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [currentFormat, setCurrentFormat] = useState('paragraph');
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const savedRange = useRef<Range | null>(null);
  const isInitialized = useRef(false);
  const lastEmittedValue = useRef<string>(value || '');

  // Synchronize incoming value into editorRef safely
  useEffect(() => {
    if (!editorRef.current) return;

    // First mount with content
    if (!isInitialized.current) {
      if (value) {
        editorRef.current.innerHTML = value;
        lastEmittedValue.current = value;
      }
      isInitialized.current = true;
      return;
    }

    // If editor is currently focused, do not overwrite user's typing
    if (isFocused) return;

    // If incoming value matches what we just emitted, avoid redundant DOM re-injection
    if (value === lastEmittedValue.current) return;

    // Only update innerHTML if it genuinely differs
    if (editorRef.current.innerHTML !== (value || '')) {
      editorRef.current.innerHTML = value || '';
      lastEmittedValue.current = value || '';
    }
  }, [value, isFocused]);

  const checkActiveFormats = useCallback(() => {
    const active = new Set<string>();
    try {
      if (document.queryCommandState('bold')) active.add('bold');
      if (document.queryCommandState('italic')) active.add('italic');
      if (document.queryCommandState('underline')) active.add('underline');
      if (document.queryCommandState('strikeThrough')) active.add('strike');
      if (document.queryCommandState('insertUnorderedList')) active.add('ul');
      if (document.queryCommandState('insertOrderedList')) active.add('ol');
      if (document.queryCommandState('justifyLeft')) active.add('left');
      if (document.queryCommandState('justifyCenter')) active.add('center');
      if (document.queryCommandState('justifyRight')) active.add('right');
    } catch {}
    setActiveFormats(active);

    // Detect heading
    try {
      const block = document.queryCommandValue('formatBlock');
      if (block) setCurrentFormat(block.toLowerCase().replace(/[<>]/g, '') || 'p');
      else setCurrentFormat('p');
    } catch {}
  }, []);

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    if (savedRange.current) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(savedRange.current);
    }
    editorRef.current?.focus();
  };

  const exec = (cmd: string, val?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val ?? undefined);
    emitChange();
    checkActiveFormats();
  };

  const emitChange = () => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      lastEmittedValue.current = html;
      onChange(html);
    }
  };

  const applyHeading = (tag: string) => {
    exec('formatBlock', tag);
    setCurrentFormat(tag);
  };

  const handleClear = () => {
    if (!editorRef.current || !editorRef.current.innerHTML.trim()) return;
    if (window.confirm('Are you sure you want to clear the editor content?')) {
      editorRef.current.innerHTML = '';
      lastEmittedValue.current = '';
      onChange('');
      setCurrentFormat('p');
      setActiveFormats(new Set());
      editorRef.current.focus();
    }
  };

  // ── Image via URL or upload ──────────────────────────────────────
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      restoreSelection();
      exec('insertHTML', `<img src="${src}" alt="image" style="max-width:100%;height:auto;border-radius:6px;margin:4px 0;" />`);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleImageUrl = () => {
    const url = prompt('Enter image URL:');
    if (url) {
      restoreSelection();
      exec('insertHTML', `<img src="${url}" alt="image" style="max-width:100%;height:auto;border-radius:6px;margin:4px 0;" />`);
    }
  };

  // ── Hyperlink ────────────────────────────────────────────────────
  const openLinkModal = () => {
    saveSelection();
    const sel = window.getSelection();
    const selectedText = sel?.toString() || '';
    setLinkText(selectedText);
    setLinkUrl('');
    setShowLinkModal(true);
  };

  const insertLink = () => {
    restoreSelection();
    const url = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`;
    const text = linkText || url;

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      exec('createLink', url);
    } else {
      exec('insertHTML', `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline;">${text}</a>`);
    }
    setShowLinkModal(false);
  };

  // ── Font color ───────────────────────────────────────────────────
  const applyColor = (color: string) => {
    restoreSelection();
    exec('foreColor', color);
  };

  const applyHighlight = (color: string) => {
    restoreSelection();
    exec('hiliteColor', color);
  };

  // ── Divider, blockquote, code ────────────────────────────────────
  const insertDivider = () => {
    exec('insertHTML', '<hr style="border:none;border-top:2px solid #e5e7eb;margin:12px 0;" /><p><br></p>');
  };

  const insertBlockquote = () => {
    exec('insertHTML', '<blockquote style="border-left:4px solid #6366f1;padding:8px 16px;margin:8px 0;color:#4b5563;font-style:italic;background:#f9fafb;border-radius:4px;"><br></blockquote>');
  };

  const insertCode = () => {
    const sel = window.getSelection();
    const text = sel?.toString() || 'code';
    exec('insertHTML', `<code style="background:#f1f5f9;color:#dc2626;padding:2px 6px;border-radius:4px;font-family:monospace;font-size:0.875em;">${text}</code>`);
  };

  const BLOCK_LABELS: Record<string, string> = {
    p: 'Paragraph', h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3', h4: 'Heading 4',
  };

  const isActive = (f: string) => activeFormats.has(f);

  const tbBtn = (active: boolean, onClick: () => void, title: string, children: React.ReactNode, className = '') => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`h-8 w-8 rounded flex items-center justify-center transition-colors
        ${active ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-foreground'}
        ${className}`}
    >
      {children}
    </button>
  );

  return (
    <div className="border border-input rounded-lg overflow-hidden bg-background shadow-sm focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-0">

      {/* ── TOOLBAR ── */}
      <div className="flex flex-wrap gap-0.5 bg-muted/60 px-2 py-1.5 border-b border-input items-center">

        {/* Block format */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              className="h-8 px-2 rounded flex items-center gap-1 text-xs font-medium hover:bg-accent transition-colors border border-transparent hover:border-input"
            >
              {BLOCK_LABELS[currentFormat] || 'Paragraph'}
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[140px]">
            {Object.entries(BLOCK_LABELS).map(([tag, label]) => (
              <DropdownMenuItem key={tag} onSelect={() => applyHeading(tag)} className={currentFormat === tag ? 'bg-primary/10 text-primary font-semibold' : ''}>
                <span className={tag === 'h1' ? 'text-lg font-bold' : tag === 'h2' ? 'text-base font-bold' : tag === 'h3' ? 'text-sm font-bold' : tag === 'h4' ? 'text-xs font-bold' : 'text-sm'}>
                  {label}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="w-px h-5 bg-border mx-0.5" />

        {/* Undo / Redo */}
        {tbBtn(false, () => exec('undo'), 'Undo (Ctrl+Z)', <Undo2 className="h-3.5 w-3.5" />)}
        {tbBtn(false, () => exec('redo'), 'Redo (Ctrl+Y)', <Redo2 className="h-3.5 w-3.5" />)}

        <div className="w-px h-5 bg-border mx-0.5" />

        {/* Bold / Italic / Underline / Strike */}
        {tbBtn(isActive('bold'), () => exec('bold'), 'Bold (Ctrl+B)', <Bold className="h-4 w-4" />)}
        {tbBtn(isActive('italic'), () => exec('italic'), 'Italic (Ctrl+I)', <Italic className="h-4 w-4" />)}
        {tbBtn(isActive('underline'), () => exec('underline'), 'Underline (Ctrl+U)', <Underline className="h-4 w-4" />)}
        {tbBtn(isActive('strike'), () => exec('strikeThrough'), 'Strikethrough', <Strikethrough className="h-4 w-4" />)}

        <div className="w-px h-5 bg-border mx-0.5" />

        {/* Font Color */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="Font Color"
              onMouseDown={(e) => { e.preventDefault(); saveSelection(); }}
              className="h-8 w-8 rounded flex items-center justify-center hover:bg-accent transition-colors"
            >
              <Palette className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="p-2">
            <p className="text-xs text-muted-foreground mb-1.5 font-medium">Font Color</p>
            <div className="grid grid-cols-7 gap-1">
              {FONT_COLORS.map(c => (
                <button key={c} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => applyColor(c)}
                  className="h-5 w-5 rounded-full border border-border hover:scale-110 transition-transform"
                  style={{ backgroundColor: c }} title={c} />
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Highlight */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="Highlight"
              onMouseDown={(e) => { e.preventDefault(); saveSelection(); }}
              className="h-8 w-8 rounded flex items-center justify-center hover:bg-accent transition-colors"
            >
              <Highlighter className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="p-2">
            <p className="text-xs text-muted-foreground mb-1.5 font-medium">Highlight</p>
            <div className="grid grid-cols-4 gap-1">
              {HIGHLIGHT_COLORS.map(c => (
                <button key={c} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => applyHighlight(c)}
                  className="h-5 w-5 rounded border border-border hover:scale-110 transition-transform"
                  style={{ backgroundColor: c }} title={c} />
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="w-px h-5 bg-border mx-0.5" />

        {/* Lists */}
        {tbBtn(isActive('ul'), () => exec('insertUnorderedList'), 'Bullet List', <List className="h-4 w-4" />)}
        {tbBtn(isActive('ol'), () => exec('insertOrderedList'), 'Numbered List', <ListOrdered className="h-4 w-4" />)}
        {tbBtn(false, insertBlockquote, 'Blockquote', <Quote className="h-4 w-4" />)}
        {tbBtn(false, insertCode, 'Inline Code', <Code className="h-4 w-4" />)}

        <div className="w-px h-5 bg-border mx-0.5" />

        {/* Alignment */}
        {tbBtn(isActive('left'), () => exec('justifyLeft'), 'Align Left', <AlignLeft className="h-4 w-4" />)}
        {tbBtn(isActive('center'), () => exec('justifyCenter'), 'Align Center', <AlignCenter className="h-4 w-4" />)}
        {tbBtn(isActive('right'), () => exec('justifyRight'), 'Align Right', <AlignRight className="h-4 w-4" />)}

        <div className="w-px h-5 bg-border mx-0.5" />

        {/* Link */}
        {tbBtn(false, openLinkModal, 'Insert Hyperlink', <Link2 className="h-4 w-4" />)}

        {/* Image upload */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="Insert Image"
              onMouseDown={(e) => { e.preventDefault(); saveSelection(); }}
              className="h-8 w-8 rounded flex items-center justify-center hover:bg-accent transition-colors"
            >
              <ImageIcon className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => imageInputRef.current?.click()}>
              📁 Upload from device
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleImageUrl}>
              🔗 Insert from URL
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

        {/* Divider */}
        {tbBtn(false, insertDivider, 'Horizontal Line', <Minus className="h-4 w-4" />)}

        <div className="w-px h-5 bg-border mx-0.5" />

        {/* Clear */}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleClear}
          title="Clear All"
          className="h-8 px-2 rounded text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          Clear
        </button>
      </div>

      {/* ── EDITOR BODY ── */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={emitChange}
        onFocus={() => { setIsFocused(true); checkActiveFormats(); }}
        onBlur={() => setIsFocused(false)}
        onMouseUp={checkActiveFormats}
        onKeyUp={checkActiveFormats}
        onPaste={(e) => {
          // Allow rich paste — let browser handle it
          setTimeout(emitChange, 50);
        }}
        data-placeholder={placeholder || 'Write your task description here...'}
        className="outline-none text-sm bg-background p-4"
        style={{
          minHeight,
          whiteSpace: 'pre-wrap',
          wordWrap: 'break-word',
          lineHeight: '1.7',
        }}
      />

      {/* Placeholder via CSS */}
      <style>{`
        [data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
          position: absolute;
        }
        [contenteditable] img {
          cursor: pointer;
          max-width: 320px !important;
          max-height: 200px !important;
          object-fit: contain !important;
          border-radius: 6px !important;
          border: 1px solid #e5e7eb !important;
          margin: 8px 0 !important;
          display: block !important;
          transition: transform 0.2s ease;
        }
        [contenteditable] img:hover {
          transform: scale(1.02);
        }
        [contenteditable] a { color: #2563eb; text-decoration: underline; }
        [contenteditable] blockquote { border-left: 4px solid #6366f1; padding: 8px 16px; margin: 8px 0; color: #4b5563; font-style: italic; background: #f9fafb; border-radius: 4px; }
        [contenteditable] code { background: #f1f5f9; color: #dc2626; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 0.875em; }
        [contenteditable] h1 { font-size: 1.75rem; font-weight: 700; margin: 8px 0; }
        [contenteditable] h2 { font-size: 1.375rem; font-weight: 700; margin: 6px 0; }
        [contenteditable] h3 { font-size: 1.125rem; font-weight: 600; margin: 4px 0; }
        [contenteditable] h4 { font-size: 1rem; font-weight: 600; margin: 4px 0; }
        [contenteditable] ul { list-style: disc; padding-left: 1.5rem; }
        [contenteditable] ol { list-style: decimal; padding-left: 1.5rem; }
      `}</style>

      {/* ── LINK MODAL ── */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowLinkModal(false)}>
          <div className="bg-background border border-border rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-base flex items-center gap-2">
                <Link2 className="h-4 w-4 text-primary" /> Insert Hyperlink
              </h3>
              <button type="button" onClick={() => setShowLinkModal(false)} className="h-7 w-7 rounded flex items-center justify-center hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">URL *</label>
                <input
                  type="url"
                  placeholder="https://example.com"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && linkUrl && insertLink()}
                  autoFocus
                  className="mt-1 w-full text-sm border border-input rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Display Text</label>
                <input
                  type="text"
                  placeholder="Link text (optional)"
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  className="mt-1 w-full text-sm border border-input rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button type="button" onClick={() => setShowLinkModal(false)} className="flex-1 py-2 rounded-md border border-input text-sm font-medium hover:bg-muted transition-colors">
                Cancel
              </button>
              <button type="button" onClick={insertLink} disabled={!linkUrl}
                className="flex-1 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
                Insert Link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
