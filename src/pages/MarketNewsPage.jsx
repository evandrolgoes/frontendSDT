import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../contexts/AuthContext";
import { resourceService } from "../services/resourceService";

const pad = (value) => String(value).padStart(2, "0");

const toLocalDatetimeValue = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
    hour: "2-digit",
    minute: "2-digit",
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

const buildExcerpt = (post) => {
  const excerpt = stripHtml(post?.conteudo_html || "");
  return excerpt.length > 220 ? `${excerpt.slice(0, 217)}...` : excerpt;
};

const getAttachmentUrl = (attachment) => attachment?.file_url || attachment?.file || "";

const isImageAttachment = (attachment) => /\.(png|jpe?g|gif|webp|svg)$/i.test(getAttachmentUrl(attachment));

const normalizeCategories = (items) => {
  const result = [];
  const seen = new Set();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const normalized = String(item || "").trim();
    if (!normalized) {
      return;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(normalized);
  });
  return result;
};

const toEditorState = (post = {}) => ({
  id: post.id,
  titulo: post.titulo || "",
  categorias: normalizeCategories(post.categorias || []),
  status_artigo: post.status_artigo || "draft",
  data_publicacao: post.data_publicacao ? toLocalDatetimeValue(post.data_publicacao) : toLocalDatetimeValue(),
  audio: post.audio || "",
  remove_audio: false,
  conteudo_html: post.conteudo_html || "",
});

const normalizeSavePayload = (state, html) => {
  const payload = {
    titulo: String(state.titulo || "").trim(),
    categorias: normalizeCategories(state.categorias),
    status_artigo: state.status_artigo || "draft",
    data_publicacao: state.data_publicacao ? new Date(state.data_publicacao).toISOString() : null,
    conteudo_html: String(html || "").trim(),
  };
  if (state.audio instanceof File) {
    payload.audio = state.audio;
  }
  if (state.remove_audio) {
    payload.remove_audio = true;
  }
  return payload;
};

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

function NewsComposerModal({ initialPost, existingCategories, attachments, onClose, onSave, onRemoveAttachment }) {
  const formId = "market-news-editor-form";
  const [form, setForm] = useState(toEditorState(initialPost));
  const [newCategory, setNewCategory] = useState("");
  const [attachmentFiles, setAttachmentFiles] = useState([]);
  const [fontSize, setFontSize] = useState("18");
  const [fontColor, setFontColor] = useState("#5b6472");
  const [htmlDialogOpen, setHtmlDialogOpen] = useState(false);
  const [htmlDraft, setHtmlDraft] = useState("");
  const editorRef = useRef(null);
  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const audioInputRef = useRef(null);
  const lastAppliedHtmlRef = useRef("");

  useEffect(() => {
    const nextState = toEditorState(initialPost);
    setForm(nextState);
    setNewCategory("");
    setAttachmentFiles([]);
    setHtmlDraft("");
    setHtmlDialogOpen(false);
    lastAppliedHtmlRef.current = nextState.conteudo_html || "";
    if (editorRef.current) {
      editorRef.current.innerHTML = nextState.conteudo_html || "";
      normalizeEditorMedia(editorRef.current);
      lastAppliedHtmlRef.current = editorRef.current.innerHTML || "";
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
    lastAppliedHtmlRef.current = nextHtml;
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

  const toggleCategory = (category) => {
    setForm((current) => {
      const currentItems = normalizeCategories(current.categorias);
      const exists = currentItems.some((item) => item.toLowerCase() === String(category).toLowerCase());
      return {
        ...current,
        categorias: exists
          ? currentItems.filter((item) => item.toLowerCase() !== String(category).toLowerCase())
          : [...currentItems, category],
      };
    });
  };

  const addCategory = () => {
    const normalized = String(newCategory || "").trim();
    if (!normalized) {
      return;
    }
    setForm((current) => ({
      ...current,
      categorias: normalizeCategories([...current.categorias, normalized]),
    }));
    setNewCategory("");
  };

  return (
    <div className="market-news-editor-page">
      <form
        id={formId}
        className="market-news-editor-panel"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(normalizeSavePayload(form, syncEditorHtml()), form.id, { attachmentFiles });
        }}
      >
        <div className="market-news-editor-header">
          <div>
            <strong>{form.id ? "Editar post" : "Novo post"}</strong>
            <div className="muted">Conteúdo corrido com formatação rica, imagens, vídeos e HTML no mesmo fluxo.</div>
          </div>
          <div className="modal-header-actions">
            <button className="btn btn-primary" type="submit">
              Salvar
            </button>
            <button className="btn btn-secondary" type="button" onClick={onClose}>
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
              <label>Status do artigo</label>
              <select className="form-control" value={form.status_artigo} onChange={(event) => setForm((current) => ({ ...current, status_artigo: event.target.value }))}>
                <option value="draft">Rascunho</option>
                <option value="published">Publicado</option>
              </select>
            </div>

            <div className="field">
              <label>Data publicação</label>
              <input
                className="form-control"
                type="datetime-local"
                value={form.data_publicacao}
                onChange={(event) => setForm((current) => ({ ...current, data_publicacao: event.target.value }))}
              />
            </div>

            <div className="field field-full">
              <label>Selecione as categorias desse post</label>
              <div className="market-news-category-chip-list">
                {existingCategories.map((category) => {
                  const active = form.categorias.some((item) => item.toLowerCase() === category.toLowerCase());
                  return (
                    <button
                      key={category}
                      type="button"
                      className={`market-news-category-chip${active ? " is-active" : ""}`}
                      onClick={() => toggleCategory(category)}
                    >
                      {category}
                    </button>
                  );
                })}
                {!existingCategories.length ? <span className="muted">Nenhuma categoria ainda.</span> : null}
              </div>
              <div className="market-news-category-input-row">
                <input
                  className="form-control"
                  placeholder="Nova categoria"
                  value={newCategory}
                  onChange={(event) => setNewCategory(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addCategory();
                    }
                  }}
                />
                <button className="btn btn-secondary" type="button" onClick={addCategory}>
                  Adicionar
                </button>
              </div>
              {form.categorias.length ? (
                <>
                  <div className="market-news-selected-label">Categorias selecionadas</div>
                  <div className="market-news-category-chip-list">
                  {form.categorias.map((category) => (
                    <button
                      key={`selected-${category}`}
                      type="button"
                      className="market-news-category-chip is-active"
                      onClick={() => toggleCategory(category)}
                    >
                      {category}
                    </button>
                  ))}
                  </div>
                </>
              ) : null}
            </div>

            <div className="field">
              <label>Audio</label>
              <div className="market-news-file-stack">
                {form.audio && !(form.audio instanceof File) && !form.remove_audio ? (
                  <div className="market-news-file-row">
                    <span>{String(form.audio).split("/").pop()}</span>
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, audio: "", remove_audio: true }))}
                    >
                      Remover
                    </button>
                  </div>
                ) : null}
                {form.audio instanceof File ? (
                  <div className="market-news-file-row">
                    <span>{form.audio.name}</span>
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, audio: "", remove_audio: false }))}
                    >
                      Remover
                    </button>
                  </div>
                ) : null}
                <div className="market-news-file-actions">
                  <button className="btn btn-secondary" type="button" onClick={() => audioInputRef.current?.click()}>
                    {form.audio ? "Trocar audio" : "Adicionar audio"}
                  </button>
                </div>
              </div>
            </div>

            <div className="field">
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
          <input
            ref={audioInputRef}
            type="file"
            accept="audio/*"
            className="market-news-hidden-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                setForm((current) => ({ ...current, audio: file, remove_audio: false }));
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
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" type="submit">
            Salvar
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

export function MarketNewsPage({ basePath = "/mercado/blog-news" }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { postId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [posts, setPosts] = useState([]);
  const [categoryPool, setCategoryPool] = useState([]);
  const [postAttachments, setPostAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editorState, setEditorState] = useState(null);
  const [audioRate, setAudioRate] = useState(1);
  const audioRef = useRef(null);

  const activeCategory = searchParams.get("categoria") || "";
  const currentSearch = searchParams.toString();
  const backToListUrl = activeCategory ? `${basePath}?categoria=${encodeURIComponent(activeCategory)}` : basePath;
  const canManagePosts = Boolean(user?.is_superuser || ["owner", "manager"].includes(user?.role));
  const canDeletePosts = Boolean(user?.is_superuser);

  const loadPosts = async () => {
    setLoading(true);
    setError("");
    try {
      const [items, categories] = await Promise.all([
        resourceService.listAll("market-news-posts", {}, { force: true }),
        resourceService.listMarketNewsCategories({ force: true }),
      ]);
      setPosts(Array.isArray(items) ? items : []);
      setCategoryPool(normalizeCategories(categories));
    } catch {
      setError("Não foi possível carregar os posts de mercado.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosts();
  }, []);

  const filteredPosts = useMemo(() => {
    const sorted = [...posts].sort(
      (left, right) => new Date(right?.data_publicacao || right?.created_at || 0) - new Date(left?.data_publicacao || left?.created_at || 0),
    );
    if (!activeCategory) {
      return sorted;
    }
    return sorted.filter((post) =>
      (Array.isArray(post.categorias) ? post.categorias : []).some(
        (category) => String(category).toLowerCase() === activeCategory.toLowerCase(),
      ),
    );
  }, [activeCategory, posts]);

  const selectedPost = useMemo(
    () => posts.find((item) => String(item.id) === String(postId)) || null,
    [posts, postId],
  );

  useEffect(() => {
    if (!postId) {
      return;
    }
    if (loading) {
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
      .listAttachments("market-news-posts", currentPostId, { force: true })
      .then((items) => setPostAttachments(Array.isArray(items) ? items : []))
      .catch(() => setPostAttachments([]));
  }, [editorState?.id, selectedPost?.id]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = audioRate;
    }
  }, [audioRate, selectedPost?.id]);

  const handleSavePost = async (payload, postId, options = {}) => {
    try {
      let saved = null;
      if (postId) {
        saved = await resourceService.patch("market-news-posts", postId, payload);
      } else {
        saved = await resourceService.create("market-news-posts", payload);
      }
      if (options.attachmentFiles?.length && saved?.id) {
        await resourceService.uploadAttachments("market-news-posts", saved.id, options.attachmentFiles);
      }
      resourceService.invalidateCache("market-news-posts");
      resourceService.invalidateCache("attachments");
      setEditorState(null);
      window.dispatchEvent(new Event("market-news-categories-changed"));
      await loadPosts();
    } catch {
      setError("Não foi possível salvar o post.");
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
        const items = await resourceService.listAttachments("market-news-posts", currentPostId, { force: true });
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
    const confirmed = window.confirm(`Excluir o post "${post.titulo}"?`);
    if (!confirmed) {
      return;
    }
    try {
      await resourceService.remove("market-news-posts", post.id);
      resourceService.invalidateCache("market-news-posts");
      window.dispatchEvent(new Event("market-news-categories-changed"));
      navigate(backToListUrl, { replace: true });
      await loadPosts();
    } catch {
      setError("Não foi possível excluir o post.");
    }
  };

  const handleDuplicatePost = async (post) => {
    if (!post?.id) {
      return;
    }
    const duplicatedEditorState = toEditorState({});
    const payload = {
      titulo: `${post.titulo || "Sem titulo"} (Copia)`,
      categorias: Array.isArray(post.categorias) ? post.categorias : [],
      conteudo_html: post.conteudo_html || "",
      status_artigo: "draft",
      data_publicacao: duplicatedEditorState.data_publicacao ? new Date(duplicatedEditorState.data_publicacao).toISOString() : null,
    };
    try {
      await resourceService.create("market-news-posts", payload);
      resourceService.invalidateCache("market-news-posts");
      window.dispatchEvent(new Event("market-news-categories-changed"));
      await loadPosts();
    } catch {
      setError("Não foi possível duplicar o post.");
    }
  };

  return (
    <div className="resource-page dashboard-page market-news-page">
      <PageHeader
        title="Blog/News"
        description=""
        tag="Mercado"
      />

      <section className="market-news-main">
        <div className="market-news-toolbar">
          <h2>{editorState ? (editorState?.titulo || "Novo post") : selectedPost ? selectedPost.titulo : "News"}</h2>
          <div className="market-news-toolbar-actions">
            {editorState ? (
              <button className="btn btn-secondary" type="button" onClick={() => setEditorState(null)}>
                Voltar
              </button>
            ) : null}
            {editorState ? (
              <button className="btn btn-primary" type="submit" form="market-news-editor-form">
                Salvar
              </button>
            ) : null}
            {!editorState && selectedPost ? (
              <button className="btn btn-secondary" type="button" onClick={() => navigate(backToListUrl)}>
                Voltar
              </button>
            ) : null}
            {canManagePosts && !editorState ? (
              <button className="btn btn-primary" type="button" onClick={() => setEditorState(selectedPost || {})}>
                {selectedPost ? "Editar post" : "Novo post"}
              </button>
            ) : null}
            {canDeletePosts && selectedPost && !editorState ? (
              <button className="btn btn-secondary" type="button" onClick={handleDeletePost}>
                Excluir post
              </button>
            ) : null}
          </div>
        </div>

        {error ? <div className="form-error">{error}</div> : null}
        {loading ? <div className="market-news-empty">Carregando posts...</div> : null}

        {!loading && editorState !== null ? (
          <NewsComposerModal
            initialPost={editorState}
            existingCategories={categoryPool}
            attachments={postAttachments}
            onClose={() => setEditorState(null)}
            onSave={handleSavePost}
            onRemoveAttachment={handleRemoveAttachment}
          />
        ) : null}

        {!loading && !selectedPost && editorState === null ? (
          <div className="market-news-list">
            {filteredPosts.map((post) => {
              const dateParts = getDateParts(post.data_publicacao || post.created_at);
              const isDraft = post.status_artigo === "draft";
              return (
                <article className={`market-news-list-item${isDraft ? " is-draft" : ""}`} key={post.id}>
                  <div className="market-news-list-date">
                    <strong>{dateParts.day}</strong>
                    <span>{dateParts.month}</span>
                    <small>{dateParts.year}</small>
                  </div>
                  <Link className="market-news-list-link" to={`${basePath}/${post.id}${currentSearch ? `?${currentSearch}` : ""}`}>
                    <div className="market-news-list-body">
                      <h3>{post.titulo}</h3>
                      <div className="market-news-list-meta">
                        <span>{(Array.isArray(post.categorias) ? post.categorias : []).join(", ") || "Sem categoria"}</span>
                        <span>
                          Publicado por: {post.published_by_name || post.created_by_name || "Equipe"} · {formatPostDate(post.data_publicacao || post.created_at)}
                        </span>
                        {isDraft ? <span>Rascunho</span> : null}
                      </div>
                      <p>{buildExcerpt(post) || "Sem conteúdo ainda."}</p>
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
            {!filteredPosts.length ? <div className="market-news-empty">Nenhum post encontrado nessa categoria.</div> : null}
          </div>
        ) : null}

        {!loading && selectedPost && editorState === null ? (
          <article className="market-news-detail">
            <div className="market-news-detail-meta">
              <div className="market-news-detail-badges">
                {(Array.isArray(selectedPost.categorias) ? selectedPost.categorias : []).map((category) => (
                  <button
                    className="market-news-badge market-news-badge-button"
                    key={category}
                    type="button"
                    onClick={() => {
                      navigate(`${basePath}?categoria=${encodeURIComponent(category)}`);
                    }}
                  >
                    {category}
                  </button>
                ))}
              </div>
              <div className="market-news-detail-submeta">
                <span>Por: {selectedPost.published_by_name || selectedPost.created_by_name || "Equipe"}</span>
                <span>Publicado em: {formatPostDate(selectedPost.data_publicacao || selectedPost.created_at)}</span>
              </div>
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
            {selectedPost.audio ? (
              <div className="market-news-audio-card">
                <div className="market-news-audio-header">
                  <strong>Audio do post</strong>
                  <div className="market-news-audio-rates">
                    {[1, 1.25, 1.5, 2].map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        className={`market-news-audio-rate${audioRate === rate ? " is-active" : ""}`}
                        onClick={() => setAudioRate(rate)}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>
                </div>
                <audio ref={audioRef} controls src={selectedPost.audio} className="market-news-audio-player" />
              </div>
            ) : null}
            <div className="market-news-content" dangerouslySetInnerHTML={{ __html: selectedPost.conteudo_html || "" }} />
            {!stripHtml(selectedPost.conteudo_html || "").length ? <div className="market-news-empty">Este post ainda não possui conteúdo.</div> : null}
          </article>
        ) : null}
      </section>
    </div>
  );
}
