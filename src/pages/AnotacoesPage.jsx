import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../contexts/AuthContext";
import { resourceService } from "../services/resourceService";

const pad = (value) => String(value).padStart(2, "0");

const toLocalDateValue = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const stripHtml = (value) =>
  String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const formatPostDate = (value) => {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
};

const getDateParts = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return { day: "--", month: "---", year: "----" };
  }
  const month = date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "").toUpperCase();
  return {
    day: String(date.getDate()).padStart(2, "0"),
    month,
    year: String(date.getFullYear()),
  };
};

const buildExcerpt = (item) => {
  const excerpt = stripHtml(item?.conteudo_html || "");
  return excerpt.length > 220 ? `${excerpt.slice(0, 217)}...` : excerpt;
};

const getAttachmentUrl = (attachment) => attachment?.file_url || attachment?.file || "";

const isImageAttachment = (attachment) => /\.(png|jpe?g|gif|webp|svg)$/i.test(getAttachmentUrl(attachment));

const normalizeIdList = (items) =>
  Array.from(
    new Set(
      (Array.isArray(items) ? items : [])
        .map((item) => Number.parseInt(item, 10))
        .filter((item) => Number.isInteger(item) && item > 0),
    ),
  );

const toEditorState = (item = {}) => ({
  id: item.id,
  titulo: item.titulo || "",
  data: item.data ? toLocalDateValue(item.data) : toLocalDateValue(),
  grupos: normalizeIdList(item.grupos || []),
  subgrupos: normalizeIdList(item.subgrupos || []),
  participantes: item.participantes || "",
  conteudo_html: item.conteudo_html || "",
});

const normalizeSavePayload = (state, html) => ({
  titulo: String(state.titulo || "").trim(),
  data: state.data || null,
  grupos: normalizeIdList(state.grupos),
  subgrupos: normalizeIdList(state.subgrupos),
  participantes: String(state.participantes || "").trim(),
  conteudo_html: String(html || "").trim(),
});

const toYoutubeEmbed = (value) => {
  const url = String(value || "").trim();
  if (!url) {
    return "";
  }
  const shortMatch = url.match(/youtu\.be\/([^?&/]+)/i);
  if (shortMatch?.[1]) {
    return `https://www.youtube.com/embed/${shortMatch[1]}`;
  }
  const fullMatch = url.match(/[?&]v=([^?&/]+)/i);
  if (fullMatch?.[1]) {
    return `https://www.youtube.com/embed/${fullMatch[1]}`;
  }
  return url;
};

const buildResizableMediaHtml = (innerHtml, { width = "520px", height = "auto" } = {}) =>
  `<div class="market-news-resizable" data-resizable-media="true" tabindex="-1" contenteditable="false" style="width:${width};height:${height};max-width:100%;resize:both;overflow:auto;">${innerHtml}</div><p><br></p>`;

const isMediaTag = (element) => ["IMG", "VIDEO", "IFRAME"].includes(element?.tagName);

const ensureResizeHandle = (wrapper) => {
  if (!(wrapper instanceof Element)) {
    return null;
  }
  const existingHandle = wrapper.querySelector(":scope > .market-news-resize-handle");
  if (existingHandle) {
    return existingHandle;
  }
  const handle = wrapper.ownerDocument.createElement("button");
  handle.type = "button";
  handle.className = "market-news-resize-handle";
  handle.contentEditable = "false";
  handle.tabIndex = -1;
  handle.setAttribute("aria-label", "Redimensionar mídia");
  wrapper.appendChild(handle);
  return handle;
};

const createResizableWrapper = (documentRef, width = "520px", height = "auto") => {
  const wrapper = documentRef.createElement("div");
  wrapper.className = "market-news-resizable";
  wrapper.dataset.resizableMedia = "true";
  wrapper.tabIndex = -1;
  wrapper.contentEditable = "false";
  wrapper.style.width = width;
  wrapper.style.height = height;
  wrapper.style.maxWidth = "100%";
  wrapper.style.overflow = "hidden";
  ensureResizeHandle(wrapper);
  return wrapper;
};

const wrapMediaNode = (node) => {
  if (!(node instanceof Element) || node.closest(".market-news-resizable")) {
    return node?.closest?.(".market-news-resizable") || null;
  }

  const documentRef = node.ownerDocument;
  const sourceNode = node.tagName === "FIGURE" ? node : node.closest("figure") || node;
  const width = sourceNode.getAttribute("width")
    || sourceNode.style.width
    || (sourceNode.tagName === "IFRAME" ? "640px" : "520px");
  const height = sourceNode.getAttribute("height")
    || sourceNode.style.height
    || (sourceNode.tagName === "VIDEO" || sourceNode.tagName === "IFRAME" ? "360px" : "auto");

  const wrapper = createResizableWrapper(documentRef, width, height);
  sourceNode.parentNode?.insertBefore(wrapper, sourceNode);
  wrapper.appendChild(sourceNode);

  if (sourceNode.tagName === "IMG" && !sourceNode.style.objectFit) {
    sourceNode.style.objectFit = "contain";
  }
  if (isMediaTag(sourceNode) && !sourceNode.style.width) {
    sourceNode.style.width = "100%";
  }
  if (isMediaTag(sourceNode) && !sourceNode.style.height) {
    sourceNode.style.height = "100%";
  }

  if (!wrapper.nextElementSibling || wrapper.nextElementSibling.tagName !== "P") {
    const spacer = documentRef.createElement("p");
    spacer.innerHTML = "<br>";
    wrapper.parentNode?.insertBefore(spacer, wrapper.nextSibling);
  }

  return wrapper;
};

const normalizeEditorMedia = (editor) => {
  if (!editor) {
    return;
  }
  Array.from(editor.querySelectorAll("img, video, iframe, figure")).forEach((node) => {
    const candidate = node.tagName === "FIGURE" || isMediaTag(node) ? node : null;
    if (!candidate) {
      return;
    }
    const hasMediaInside = candidate.tagName === "FIGURE" ? candidate.querySelector("img, video, iframe") : true;
    if (hasMediaInside) {
      const wrapper = wrapMediaNode(candidate);
      ensureResizeHandle(wrapper);
    }
  });
  editor.querySelectorAll(".market-news-resizable").forEach((wrapper) => ensureResizeHandle(wrapper));
};

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("file-read-error"));
    reader.readAsDataURL(file);
  });

function AnotacaoComposerModal({
  initialPost,
  attachments,
  groups,
  subgroups,
  onClose,
  onSave,
  onRemoveAttachment,
  isSaving = false,
}) {
  const formId = "anotacoes-editor-form";
  const [form, setForm] = useState(toEditorState(initialPost));
  const [attachmentFiles, setAttachmentFiles] = useState([]);
  const [fontSize, setFontSize] = useState("18");
  const [fontColor, setFontColor] = useState("#5b6472");
  const [htmlDialogOpen, setHtmlDialogOpen] = useState(false);
  const [htmlDraft, setHtmlDraft] = useState("");
  const editorRef = useRef(null);
  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);

  useEffect(() => {
    const nextState = toEditorState(initialPost);
    setForm(nextState);
    setAttachmentFiles([]);
    setHtmlDraft("");
    setHtmlDialogOpen(false);
    if (editorRef.current) {
      editorRef.current.innerHTML = nextState.conteudo_html || "";
      normalizeEditorMedia(editorRef.current);
    }
  }, [initialPost]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return undefined;
    }

    const clearSelectedMedia = () => {
      editor.querySelectorAll(".market-news-resizable.is-selected").forEach((item) => item.classList.remove("is-selected"));
    };

    const handlePointerDown = (event) => {
      const eventTarget = event.target instanceof Element ? event.target : null;
      const resizeHandle = eventTarget?.closest(".market-news-resize-handle") || null;
      const resizeTarget = resizeHandle?.closest(".market-news-resizable") || null;
      if (resizeHandle && resizeTarget && editor.contains(resizeTarget)) {
        clearSelectedMedia();
        resizeTarget.classList.add("is-selected");
        resizeTarget.focus();

        const startRect = resizeTarget.getBoundingClientRect();
        const startWidth = startRect.width;
        const startHeight = startRect.height;
        const startX = event.clientX;
        const startY = event.clientY;
        const parentWidth = resizeTarget.parentElement?.getBoundingClientRect().width || Number.POSITIVE_INFINITY;
        const maxWidth = Math.max(220, parentWidth - 8);

        const handleMove = (moveEvent) => {
          const width = Math.max(180, Math.min(maxWidth, startWidth + (moveEvent.clientX - startX)));
          const height = Math.max(120, startHeight + (moveEvent.clientY - startY));
          resizeTarget.style.width = `${Math.round(width)}px`;
          resizeTarget.style.height = `${Math.round(height)}px`;
        };

        const handleUp = () => {
          window.removeEventListener("mousemove", handleMove);
          window.removeEventListener("mouseup", handleUp);
          syncEditorHtml();
        };

        window.addEventListener("mousemove", handleMove);
        window.addEventListener("mouseup", handleUp);
        event.preventDefault();
        return;
      }

      const directMedia = eventTarget && (isMediaTag(eventTarget) ? eventTarget : eventTarget.closest("img, video, iframe, figure"));
      const upgradedMediaBlock = directMedia ? wrapMediaNode(directMedia) : null;
      const mediaBlock = upgradedMediaBlock || eventTarget?.closest(".market-news-resizable") || null;
      if (!mediaBlock || !editor.contains(mediaBlock)) {
        clearSelectedMedia();
        return;
      }
      ensureResizeHandle(mediaBlock);
      clearSelectedMedia();
      mediaBlock.classList.add("is-selected");
      mediaBlock.focus();
      event.preventDefault();
    };

    editor.addEventListener("mousedown", handlePointerDown);
    return () => {
      editor.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  const syncEditorHtml = () => {
    normalizeEditorMedia(editorRef.current);
    const nextHtml = editorRef.current?.innerHTML || "";
    setForm((current) => ({ ...current, conteudo_html: nextHtml }));
    return nextHtml;
  };

  const focusEditor = () => {
    editorRef.current?.focus();
  };

  const runCommand = (command, value = null) => {
    focusEditor();
    document.execCommand(command, false, value);
    syncEditorHtml();
  };

  const insertHtml = (html) => {
    if (!html) {
      return;
    }
    focusEditor();
    document.execCommand("insertHTML", false, html);
    syncEditorHtml();
  };

  const wrapSelectionWithStyle = (styleText) => {
    const selection = window.getSelection();
    const text = selection?.toString() || "";
    const safeText = text || "Texto";
    insertHtml(`<span style="${styleText}">${safeText}</span>`);
  };

  const insertImageFromFile = async (file) => {
    if (!file) {
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    insertHtml(
      buildResizableMediaHtml(
        `<figure><img src="${dataUrl}" alt="${file.name}" style="width:100%;height:100%;object-fit:contain;" /><figcaption>${file.name}</figcaption></figure>`,
        { width: "520px", height: "360px" },
      ),
    );
  };

  const insertVideoFromFile = async (file) => {
    if (!file) {
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    insertHtml(
      buildResizableMediaHtml(
        `<video controls src="${dataUrl}" style="width:100%;height:100%;"></video><p>${file.name}</p>`,
        { width: "640px", height: "360px" },
      ),
    );
  };

  const toggleMultiValue = (fieldName, value) => {
    setForm((current) => {
      const numericValue = Number.parseInt(value, 10);
      const currentItems = normalizeIdList(current[fieldName]);
      const exists = currentItems.includes(numericValue);
      return {
        ...current,
        [fieldName]: exists ? currentItems.filter((item) => item !== numericValue) : [...currentItems, numericValue],
      };
    });
  };

  return (
    <div className="market-news-editor-page">
      <form
        id={formId}
        className="market-news-editor-panel"
        onSubmit={(event) => {
          event.preventDefault();
          if (isSaving) {
            return;
          }
          onSave(normalizeSavePayload(form, syncEditorHtml()), form.id, { attachmentFiles });
        }}
      >
        <div className="market-news-editor-header">
          <div>
            <strong>{form.id ? "Editar anotacao" : "Nova anotacao"}</strong>
            <div className="muted">Ata de reuniao com o mesmo editor rico do blog e suporte a anexos.</div>
          </div>
          <div className="modal-header-actions">
            <button className="btn btn-primary" type="submit" disabled={isSaving}>
              {isSaving ? "Salvando..." : "Salvar"}
            </button>
            <button className="btn btn-secondary" type="button" onClick={onClose} disabled={isSaving}>
              Fechar
            </button>
          </div>
        </div>

        <div className="market-news-editor-body">
          <div className="market-news-editor-grid">
            <div className="field field-full">
              <label>Título</label>
              <input className="form-control" value={form.titulo} onChange={(event) => setForm((current) => ({ ...current, titulo: event.target.value }))} />
            </div>

            <div className="field">
              <label>Data</label>
              <input className="form-control" type="date" value={form.data} onChange={(event) => setForm((current) => ({ ...current, data: event.target.value }))} />
            </div>

            <div className="field">
              <label>Grupos</label>
              <select
                className="form-control"
                multiple
                value={form.grupos.map(String)}
                onChange={(event) => {
                  const values = Array.from(event.target.selectedOptions || []).map((option) => option.value);
                  setForm((current) => ({ ...current, grupos: normalizeIdList(values) }));
                }}
              >
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.grupo}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Subgrupos</label>
              <select
                className="form-control"
                multiple
                value={form.subgrupos.map(String)}
                onChange={(event) => {
                  const values = Array.from(event.target.selectedOptions || []).map((option) => option.value);
                  setForm((current) => ({ ...current, subgrupos: normalizeIdList(values) }));
                }}
              >
                {subgroups.map((subgroup) => (
                  <option key={subgroup.id} value={subgroup.id}>
                    {subgroup.subgrupo}
                  </option>
                ))}
              </select>
            </div>

            <div className="field field-full">
              <label>Selecao rapida</label>
              <div className="market-news-category-chip-list">
                {groups.map((group) => (
                  <button
                    key={`group-${group.id}`}
                    type="button"
                    className={`market-news-category-chip${form.grupos.includes(group.id) ? " is-active" : ""}`}
                    onClick={() => toggleMultiValue("grupos", group.id)}
                  >
                    {group.grupo}
                  </button>
                ))}
                {subgroups.map((subgroup) => (
                  <button
                    key={`subgroup-${subgroup.id}`}
                    type="button"
                    className={`market-news-category-chip${form.subgrupos.includes(subgroup.id) ? " is-active" : ""}`}
                    onClick={() => toggleMultiValue("subgrupos", subgroup.id)}
                  >
                    {subgroup.subgrupo}
                  </button>
                ))}
              </div>
            </div>

            <div className="field field-full">
              <label>Participantes</label>
              <textarea
                className="form-control form-control-textarea"
                value={form.participantes}
                onChange={(event) => setForm((current) => ({ ...current, participantes: event.target.value }))}
                placeholder="Ex.: Maria, Joao, Time Comercial"
              />
            </div>

            <div className="field field-full">
              <label>Anexos</label>
              <div className="market-news-file-stack">
                {attachments.map((attachment) => (
                  <div className="market-news-file-row" key={attachment.id}>
                    <a href={getAttachmentUrl(attachment)} target="_blank" rel="noreferrer">
                      {attachment.original_name}
                    </a>
                    <button className="btn btn-secondary" type="button" onClick={() => onRemoveAttachment?.(attachment.id)}>
                      Remover
                    </button>
                  </div>
                ))}
                {attachmentFiles.map((file) => (
                  <div className="market-news-file-row" key={`${file.name}-${file.size}`}>
                    <span>{file.name}</span>
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => setAttachmentFiles((current) => current.filter((item) => item !== file))}
                    >
                      Tirar
                    </button>
                  </div>
                ))}
                <div className="market-news-file-actions">
                  <label className="btn btn-secondary market-news-file-picker">
                    Adicionar anexos
                    <input
                      type="file"
                      multiple
                      className="market-news-hidden-input"
                      onChange={(event) => {
                        const files = Array.from(event.target.files || []);
                        if (files.length) {
                          setAttachmentFiles((current) => [...current, ...files]);
                        }
                        event.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className="market-news-editor-toolbar">
            <button type="button" className="btn btn-secondary market-news-toolbar-btn" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("formatBlock", "<p>")}>P</button>
            <button type="button" className="btn btn-secondary market-news-toolbar-btn" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("formatBlock", "<h1>")}>H1</button>
            <button type="button" className="btn btn-secondary market-news-toolbar-btn" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("formatBlock", "<h2>")}>H2</button>
            <button type="button" className="btn btn-secondary market-news-toolbar-btn" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("formatBlock", "<h3>")}>H3</button>
            <button type="button" className="btn btn-secondary market-news-toolbar-btn" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("formatBlock", "<h4>")}>H4</button>
            <button type="button" className="btn btn-secondary market-news-toolbar-btn" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("bold")}>B</button>
            <button type="button" className="btn btn-secondary market-news-toolbar-btn" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("italic")}>I</button>
            <button type="button" className="btn btn-secondary market-news-toolbar-btn" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("underline")}>U</button>
            <button type="button" className="btn btn-secondary market-news-toolbar-btn" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("strikeThrough")}>S</button>
            <button type="button" className="btn btn-secondary market-news-toolbar-btn" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("insertUnorderedList")}>Lista</button>
            <button type="button" className="btn btn-secondary market-news-toolbar-btn" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("insertOrderedList")}>1.2.3</button>
            <button type="button" className="btn btn-secondary market-news-toolbar-btn" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("formatBlock", "<blockquote>")}>"</button>
            <button type="button" className="btn btn-secondary market-news-toolbar-btn" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("justifyLeft")}>E</button>
            <button type="button" className="btn btn-secondary market-news-toolbar-btn" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("justifyCenter")}>C</button>
            <button type="button" className="btn btn-secondary market-news-toolbar-btn" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("justifyRight")}>D</button>
            <button
              type="button"
              className="btn btn-secondary market-news-toolbar-btn"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const url = window.prompt("URL do link");
                if (url) {
                  runCommand("createLink", url);
                }
              }}
            >
              Link
            </button>
            <select
              className="form-control market-news-toolbar-select"
              value={fontSize}
              onChange={(event) => {
                setFontSize(event.target.value);
                wrapSelectionWithStyle(`font-size:${event.target.value}px;`);
              }}
            >
              <option value="16">F16</option>
              <option value="18">F18</option>
              <option value="22">F22</option>
              <option value="28">F28</option>
              <option value="36">F36</option>
              <option value="48">F48</option>
            </select>
            <label className="market-news-color-picker">
              <input
                type="color"
                value={fontColor}
                onChange={(event) => {
                  setFontColor(event.target.value);
                  wrapSelectionWithStyle(`color:${event.target.value};`);
                }}
              />
            </label>
            <button
              type="button"
              className="btn btn-secondary market-news-toolbar-btn"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const imageUrl = window.prompt("URL da imagem");
                if (!imageUrl) {
                  return;
                }
                const caption = window.prompt("Legenda da imagem (opcional)") || "";
                insertHtml(
                  buildResizableMediaHtml(
                    `<figure><img src="${imageUrl}" alt="${caption || "Imagem"}" style="width:100%;height:100%;object-fit:contain;" />${caption ? `<figcaption>${caption}</figcaption>` : ""}</figure>`,
                    { width: "520px", height: "360px" },
                  ),
                );
              }}
            >
              Img URL
            </button>
            <button type="button" className="btn btn-secondary market-news-toolbar-btn" onMouseDown={(event) => event.preventDefault()} onClick={() => imageInputRef.current?.click()}>Img</button>
            <button
              type="button"
              className="btn btn-secondary market-news-toolbar-btn"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const videoUrl = window.prompt("URL do vídeo");
                if (!videoUrl) {
                  return;
                }
                const source = toYoutubeEmbed(videoUrl);
                const html = /\.(mp4|webm|ogg)(\?.*)?$/i.test(videoUrl)
                  ? `<video controls src="${videoUrl}" style="width:100%;height:100%;"></video>`
                  : `<iframe src="${source}" allowfullscreen style="width:100%;height:100%;"></iframe>`;
                insertHtml(buildResizableMediaHtml(html, { width: "640px", height: "360px" }));
              }}
            >
              Vid URL
            </button>
            <button type="button" className="btn btn-secondary market-news-toolbar-btn" onMouseDown={(event) => event.preventDefault()} onClick={() => videoInputRef.current?.click()}>Vid</button>
            <button type="button" className="btn btn-secondary market-news-toolbar-btn" onMouseDown={(event) => event.preventDefault()} onClick={() => setHtmlDialogOpen(true)}>HTML</button>
            <button type="button" className="btn btn-secondary market-news-toolbar-btn" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("removeFormat")}>Limpar</button>
          </div>

          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="market-news-hidden-input"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (file) {
                await insertImageFromFile(file);
              }
              event.target.value = "";
            }}
          />
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            className="market-news-hidden-input"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (file) {
                await insertVideoFromFile(file);
              }
              event.target.value = "";
            }}
          />

          <div
            ref={editorRef}
            className="market-news-rich-editor"
            contentEditable
            suppressContentEditableWarning
            onInput={syncEditorHtml}
          />
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary" type="button" onClick={onClose} disabled={isSaving}>
            Cancelar
          </button>
          <button className="btn btn-primary" type="submit" disabled={isSaving}>
            {isSaving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>

      {htmlDialogOpen ? (
        <div className="market-news-html-dialog">
          <div className="market-news-html-dialog-card">
            <div className="market-news-html-dialog-header">
              <strong>Inserir HTML</strong>
              <button className="btn btn-secondary" type="button" onClick={() => setHtmlDialogOpen(false)}>
                Fechar
              </button>
            </div>
            <textarea
              className="form-control form-control-textarea market-news-html-textarea"
              value={htmlDraft}
              onChange={(event) => setHtmlDraft(event.target.value)}
              placeholder="Cole aqui o HTML completo"
            />
            <div className="modal-actions">
              <button className="btn btn-secondary" type="button" onClick={() => setHtmlDialogOpen(false)}>
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => {
                  if (htmlDraft.trim()) {
                    insertHtml(htmlDraft);
                  }
                  setHtmlDraft("");
                  setHtmlDialogOpen(false);
                }}
              >
                Inserir HTML
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AnotacoesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { postId } = useParams();
  const [posts, setPosts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [subgroups, setSubgroups] = useState([]);
  const [postAttachments, setPostAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editorState, setEditorState] = useState(null);
  const [isSavingPost, setIsSavingPost] = useState(false);

  const backToListUrl = "/anotacoes";
  const canManagePosts = Boolean(user?.is_superuser || ["owner", "manager"].includes(user?.role));
  const canDeletePosts = Boolean(user?.is_superuser);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [items, groupItems, subgroupItems] = await Promise.all([
        resourceService.listAll("anotacoes", {}, { force: true }),
        resourceService.listAll("groups", {}, { force: true }),
        resourceService.listAll("subgroups", {}, { force: true }),
      ]);
      setPosts(Array.isArray(items) ? items : []);
      setGroups(Array.isArray(groupItems) ? groupItems : []);
      setSubgroups(Array.isArray(subgroupItems) ? subgroupItems : []);
    } catch {
      setError("Não foi possível carregar as anotações.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectedPost = useMemo(
    () => posts.find((item) => String(item.id) === String(postId)) || null,
    [posts, postId],
  );

  const filteredPosts = useMemo(
    () => [...posts].sort((left, right) => new Date(right?.data || right?.updated_at || right?.created_at || 0) - new Date(left?.data || left?.updated_at || left?.created_at || 0)),
    [posts],
  );

  useEffect(() => {
    if (!postId || loading) {
      return;
    }
    if (!posts.some((item) => String(item.id) === String(postId))) {
      navigate(backToListUrl, { replace: true });
    }
  }, [backToListUrl, loading, navigate, postId, posts]);

  useEffect(() => {
    const currentPostId = editorState?.id || selectedPost?.id;
    if (!currentPostId) {
      setPostAttachments([]);
      return;
    }
    resourceService
      .listAttachments("anotacoes", currentPostId, { force: true })
      .then((items) => setPostAttachments(Array.isArray(items) ? items : []))
      .catch(() => setPostAttachments([]));
  }, [editorState?.id, selectedPost?.id]);

  const handleSavePost = async (payload, currentPostId, options = {}) => {
    setIsSavingPost(true);
    try {
      let saved = null;
      if (currentPostId) {
        saved = await resourceService.patch("anotacoes", currentPostId, payload);
      } else {
        saved = await resourceService.create("anotacoes", payload);
      }
      if (options.attachmentFiles?.length && saved?.id) {
        await resourceService.uploadAttachments("anotacoes", saved.id, options.attachmentFiles);
      }
      resourceService.invalidateCache("anotacoes");
      resourceService.invalidateCache("attachments");
      setEditorState(null);
      if (!currentPostId && saved?.id) {
        navigate(`/anotacoes/${saved.id}`);
      }
      await loadData();
    } catch {
      setError("Não foi possível salvar a anotação.");
    } finally {
      setIsSavingPost(false);
    }
  };

  const handleRemoveAttachment = async (attachmentId) => {
    if (!attachmentId) {
      return;
    }
    try {
      await resourceService.remove("attachments", attachmentId);
      const currentPostId = editorState?.id || selectedPost?.id;
      if (currentPostId) {
        const items = await resourceService.listAttachments("anotacoes", currentPostId, { force: true });
        setPostAttachments(Array.isArray(items) ? items : []);
      }
    } catch {
      setError("Não foi possível remover o anexo.");
    }
  };

  const handleDeletePost = async (post = selectedPost) => {
    if (!post?.id || !canDeletePosts) {
      return;
    }
    const confirmed = window.confirm(`Excluir a anotacao "${post.titulo}"?`);
    if (!confirmed) {
      return;
    }
    try {
      await resourceService.remove("anotacoes", post.id);
      resourceService.invalidateCache("anotacoes");
      navigate(backToListUrl, { replace: true });
      await loadData();
    } catch {
      setError("Não foi possível excluir a anotação.");
    }
  };

  const handleDuplicatePost = async (post) => {
    if (!post?.id) {
      return;
    }
    const payload = {
      titulo: `${post.titulo || "Sem titulo"} (Copia)`,
      data: post.data || toLocalDateValue(),
      grupos: Array.isArray(post.grupos) ? post.grupos : [],
      subgrupos: Array.isArray(post.subgrupos) ? post.subgrupos : [],
      participantes: post.participantes || "",
      conteudo_html: post.conteudo_html || "",
    };
    try {
      await resourceService.create("anotacoes", payload);
      resourceService.invalidateCache("anotacoes");
      await loadData();
    } catch {
      setError("Não foi possível duplicar a anotação.");
    }
  };

  return (
    <div className="resource-page dashboard-page market-news-page">
      <PageHeader title="Anotacoes" description="" tag="Cadastros" />

      <section className="market-news-main">
        <div className="market-news-toolbar">
          <h2>{editorState ? (editorState?.titulo || "Nova anotacao") : selectedPost ? selectedPost.titulo : "Atas e anotacoes"}</h2>
          <div className="market-news-toolbar-actions">
            {editorState ? (
              <button className="btn btn-secondary" type="button" onClick={() => setEditorState(null)} disabled={isSavingPost}>
                Voltar
              </button>
            ) : null}
            {editorState ? (
              <button className="btn btn-primary" type="submit" form="anotacoes-editor-form" disabled={isSavingPost}>
                {isSavingPost ? "Salvando..." : "Salvar"}
              </button>
            ) : null}
            {!editorState && selectedPost ? (
              <button className="btn btn-secondary" type="button" onClick={() => navigate(backToListUrl)}>
                Voltar
              </button>
            ) : null}
            {canManagePosts && !editorState ? (
              <button className="btn btn-primary" type="button" onClick={() => setEditorState(selectedPost || {})}>
                {selectedPost ? "Editar anotacao" : "Nova anotacao"}
              </button>
            ) : null}
            {canDeletePosts && selectedPost && !editorState ? (
              <button className="btn btn-secondary" type="button" onClick={handleDeletePost}>
                Excluir anotacao
              </button>
            ) : null}
          </div>
        </div>

        {error ? <div className="form-error">{error}</div> : null}
        {loading ? <div className="market-news-empty">Carregando anotações...</div> : null}

        {!loading && editorState !== null ? (
          <AnotacaoComposerModal
            initialPost={editorState}
            attachments={postAttachments}
            groups={groups}
            subgroups={subgroups}
            onClose={() => setEditorState(null)}
            onSave={handleSavePost}
            onRemoveAttachment={handleRemoveAttachment}
            isSaving={isSavingPost}
          />
        ) : null}

        {!loading && !selectedPost && editorState === null ? (
          <div className="market-news-list">
            {filteredPosts.map((post) => {
              const dateParts = getDateParts(post.data || post.updated_at || post.created_at);
              return (
                <article className="market-news-list-item" key={post.id}>
                  <div className="market-news-list-date">
                    <strong>{dateParts.day}</strong>
                    <span>{dateParts.month}</span>
                    <small>{dateParts.year}</small>
                  </div>
                  <Link className="market-news-list-link" to={`/anotacoes/${post.id}`}>
                    <div className="market-news-list-body">
                      <h3>{post.titulo}</h3>
                      <div className="market-news-list-meta">
                        <span>{(Array.isArray(post.grupos_display) ? post.grupos_display : []).join(", ") || "Sem grupos vinculados"}</span>
                        <span>Modificado por: {post.modificado_por_name || post.created_by_name || "Equipe"} · {formatPostDate(post.data || post.updated_at || post.created_at)}</span>
                      </div>
                      <p>{buildExcerpt(post) || post.participantes || "Sem conteúdo ainda."}</p>
                    </div>
                  </Link>
                  {canManagePosts ? (
                    <div className="market-news-list-actions">
                      <button className="btn btn-secondary" type="button" onClick={() => handleDuplicatePost(post)}>
                        Duplicar
                      </button>
                      {canDeletePosts ? (
                        <button className="btn btn-secondary" type="button" onClick={() => handleDeletePost(post)}>
                          Excluir
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
            {!filteredPosts.length ? <div className="market-news-empty">Nenhuma anotação cadastrada.</div> : null}
          </div>
        ) : null}

        {!loading && selectedPost && editorState === null ? (
          <article className="market-news-detail">
            <div className="market-news-detail-meta">
              <div className="market-news-detail-badges">
                {(Array.isArray(selectedPost.grupos_display) ? selectedPost.grupos_display : []).map((group) => (
                  <span className="market-news-badge" key={`group-${group}`}>{group}</span>
                ))}
                {(Array.isArray(selectedPost.subgrupos_display) ? selectedPost.subgrupos_display : []).map((subgroup) => (
                  <span className="market-news-badge" key={`subgroup-${subgroup}`}>{subgroup}</span>
                ))}
              </div>
              <div className="market-news-detail-submeta">
                <span>Modificado por: {selectedPost.modificado_por_name || selectedPost.created_by_name || "Equipe"}</span>
                <span>Data: {formatPostDate(selectedPost.data || selectedPost.updated_at || selectedPost.created_at)}</span>
              </div>
              {selectedPost.participantes ? (
                <div className="market-news-detail-submeta">
                  <span>Participantes: {selectedPost.participantes}</span>
                </div>
              ) : null}
            </div>

            {postAttachments.length ? (
              <div className="market-news-attachments-card">
                <strong>Anexos</strong>
                <div className="market-news-attachments-list">
                  {postAttachments.map((attachment) => (
                    <div key={attachment.id} className="market-news-attachment-item">
                      {isImageAttachment(attachment) ? (
                        <img className="market-news-attachment-preview" src={getAttachmentUrl(attachment)} alt={attachment.original_name} />
                      ) : null}
                      <a href={getAttachmentUrl(attachment)} target="_blank" rel="noreferrer" className="market-news-attachment-link">
                        {attachment.original_name}
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="market-news-content" dangerouslySetInnerHTML={{ __html: selectedPost.conteudo_html || "" }} />
            {!stripHtml(selectedPost.conteudo_html || "").length ? <div className="market-news-empty">Esta anotação ainda não possui conteúdo.</div> : null}
          </article>
        ) : null}
      </section>
    </div>
  );
}
