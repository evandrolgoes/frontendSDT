import { useEffect, useMemo, useRef, useState } from "react";
import Quill from "quill";
import "quill/dist/quill.snow.css";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { PageHeader } from "../components/PageHeader";
import { SimpleQuotesTable, buildTradingviewChartUrl, openTradingviewPopupWindow } from "../components/SimpleQuotesTable";
import { useAuth } from "../contexts/AuthContext";
import { resourceService } from "../services/resourceService";

const QUOTES_TABLE_COLUMNS = [
  { key: "section_name", label: "Secao" },
  { key: "ticker", label: "Ticker" },
  { key: "description", label: "Descricao" },
  { key: "price", label: "Preco", type: "number" },
  { key: "change_percent", label: "Variacao %", type: "number" },
  { key: "change_value", label: "Variacao", type: "number" },
  { key: "currency", label: "Moeda" },
  { key: "instrument_type", label: "Tipo" },
  { key: "symbol", label: "Simbolo" },
];

const IMAGE_UPLOAD_MAX_DIMENSION = 1600;
const IMAGE_UPLOAD_OUTPUT_TYPE = "image/webp";
const IMAGE_UPLOAD_OUTPUT_QUALITY = 0.82;
const TRADINGVIEW_REFRESH_MS = 180_000;
const QUILL_FONTS = ["sans-serif", "serif", "monospace"];
const QUILL_SIZES = ["small", "normal", "large", "huge"];

const pad = (value) => String(value).padStart(2, "0");

const FontFormat = Quill.import("formats/font");
FontFormat.whitelist = QUILL_FONTS;
Quill.register(FontFormat, true);

const SizeFormat = Quill.import("formats/size");
SizeFormat.whitelist = QUILL_SIZES;
Quill.register(SizeFormat, true);

const BlockEmbed = Quill.import("blots/block/embed");

class HtmlEmbedBlot extends BlockEmbed {
  static blotName = "htmlEmbed";
  static tagName = "div";
  static className = "blog-studio-html-embed";

  static create(value) {
    const node = super.create();
    node.setAttribute("contenteditable", "false");
    node.dataset.html = String(value || "");
    node.innerHTML = String(value || "");
    return node;
  }

  static value(node) {
    return node?.dataset?.html || node?.innerHTML || "";
  }
}

Quill.register(HtmlEmbedBlot, true);

const toLocalDatetimeValue = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const resolvePostDate = (post) => post?.data_publicacao || post?.created_at || null;

const stripHtml = (value) =>
  String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const buildExcerpt = (post) => {
  const excerpt = stripHtml(post?.excerpt || post?.conteudo_html || "");
  return excerpt.length > 180 ? `${excerpt.slice(0, 177)}...` : excerpt;
};

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

const formatPostUpdatedAt = (value) => {
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
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date).replace(",", " as");
};

const parseQuoteNumber = (value) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : Number.NaN;
  }
  const text = String(value ?? "")
    .trim()
    .replace(/\s|%/g, "");
  if (!text) {
    return Number.NaN;
  }
  const normalized = text.includes(",") && text.includes(".")
    ? text.replace(/\./g, "").replace(",", ".")
    : text.replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const formatQuoteNumber = (value, digits = 2) =>
  Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

const formatSignedQuoteNumber = (value, digits = 2) => {
  const parsed = parseQuoteNumber(value);
  if (!Number.isFinite(parsed)) {
    return "0";
  }
  const signal = parsed > 0 ? "+" : parsed < 0 ? "-" : "";
  return `${signal}${Math.abs(parsed).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
};

const getDateParts = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return { day: "--", month: "---", year: "----" };
  }
  return {
    day: String(date.getDate()).padStart(2, "0"),
    month: date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "").toUpperCase(),
    year: String(date.getFullYear()),
  };
};

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
  inline_attachment_ids: Array.isArray(post.inline_attachment_ids)
    ? post.inline_attachment_ids.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)
    : [],
  remove_audio: false,
  conteudo_html: post.conteudo_html || "",
});

const normalizeSavePayload = (state, html) => {
  const inlineAttachmentIds = Array.from(
    new Set([
      ...(Array.isArray(state.inline_attachment_ids) ? state.inline_attachment_ids : []),
      ...getInlineAttachmentIds(html),
    ]),
  )
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);
  const payload = {
    titulo: String(state.titulo || "").trim(),
    categorias: normalizeCategories(state.categorias),
    status_artigo: state.status_artigo || "draft",
    data_publicacao: state.data_publicacao ? new Date(state.data_publicacao).toISOString() : null,
    inline_attachment_ids: inlineAttachmentIds,
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

const getAttachmentUrl = (attachment) => attachment?.file_url || attachment?.file || "";

const isImageAttachment = (attachment) => {
  const mimeType = String(attachment?.stored_content_type || "").toLowerCase();
  if (mimeType.startsWith("image/")) {
    return true;
  }
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(`${attachment?.original_name || ""} ${getAttachmentUrl(attachment)}`);
};

const openAttachmentPopup = (url) => {
  if (!url || typeof window === "undefined") {
    return;
  }
  window.open(url, "_blank", "popup,width=960,height=720,noopener,noreferrer");
};

const normalizeComparableUrl = (value) => {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return "";
  }
  try {
    const baseOrigin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const url = new URL(rawValue, baseOrigin);
    return `${url.origin}${url.pathname}`;
  } catch {
    return rawValue.split("#")[0].split("?")[0];
  }
};

const extractAttachmentIdFromUrl = (value) => {
  const normalizedUrl = normalizeComparableUrl(value);
  if (!normalizedUrl) {
    return null;
  }
  const match = normalizedUrl.match(/\/attachments\/content\/(\d+)\/?$/i);
  if (!match) {
    return null;
  }
  const attachmentId = Number(match[1]);
  return Number.isInteger(attachmentId) && attachmentId > 0 ? attachmentId : null;
};

const getInlineMediaUrls = (html) => {
  const content = String(html || "").trim();
  if (!content || typeof DOMParser === "undefined") {
    return new Set();
  }
  const documentRef = new DOMParser().parseFromString(content, "text/html");
  return new Set(
    Array.from(documentRef.querySelectorAll("img[src], video[src], source[src], iframe[src], a[href]"))
      .map((element) => normalizeComparableUrl(element.getAttribute("src") || element.getAttribute("href")))
      .filter(Boolean),
  );
};

const getInlineAttachmentIds = (html) => {
  const content = String(html || "").trim();
  if (!content || typeof DOMParser === "undefined") {
    return [];
  }
  const documentRef = new DOMParser().parseFromString(content, "text/html");
  return Array.from(
    new Set(
      Array.from(documentRef.querySelectorAll("img[src], video[src], source[src], iframe[src], a[href]"))
        .map((element) => extractAttachmentIdFromUrl(element.getAttribute("src") || element.getAttribute("href")))
        .filter((item) => Number.isInteger(item) && item > 0),
    ),
  );
};

const filterStandaloneAttachments = (attachments, html, inlineAttachmentIds = []) => {
  const inlineUrls = getInlineMediaUrls(html);
  const hiddenIds = new Set(
    [...(Array.isArray(inlineAttachmentIds) ? inlineAttachmentIds : []), ...getInlineAttachmentIds(html)]
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0)
      .map(String),
  );
  return (Array.isArray(attachments) ? attachments : []).filter((attachment) => {
    if (hiddenIds.has(String(attachment?.id || ""))) {
      return false;
    }
    const attachmentUrl = normalizeComparableUrl(getAttachmentUrl(attachment));
    return attachmentUrl && !inlineUrls.has(attachmentUrl);
  });
};

const escapeHtml = (value) =>
  String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const normalizeEditorHtml = (value) => {
  const html = String(value || "").trim();
  return html === "<p><br></p>" ? "" : html;
};

const loadImageElement = (file) =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("image-load-error"));
    };
    image.src = objectUrl;
  });

const renameWithExtension = (fileName, extension) => {
  const baseName = String(fileName || "imagem").replace(/\.[^.]+$/, "") || "imagem";
  return `${baseName}.${extension}`;
};

const optimizeImageFile = async (file) => {
  const mimeType = String(file?.type || "").toLowerCase();
  if (!mimeType.startsWith("image/") || mimeType === "image/svg+xml" || mimeType === "image/gif") {
    return file;
  }

  const image = await loadImageElement(file);
  const width = image.naturalWidth || image.width || 0;
  const height = image.naturalHeight || image.height || 0;
  if (!width || !height) {
    return file;
  }

  const scale = Math.min(1, IMAGE_UPLOAD_MAX_DIMENSION / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    return file;
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, IMAGE_UPLOAD_OUTPUT_TYPE, IMAGE_UPLOAD_OUTPUT_QUALITY);
  });
  if (!blob) {
    return file;
  }
  if (blob.size >= file.size && scale === 1) {
    return file;
  }

  return new File([blob], renameWithExtension(file.name, "webp"), {
    type: blob.type,
    lastModified: file.lastModified,
  });
};

const optimizeUploadFiles = async (files) =>
  Promise.all(
    (Array.isArray(files) ? files : []).map(async (file) => {
      try {
        return await optimizeImageFile(file);
      } catch {
        return file;
      }
    }),
  );

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

function BlogAudioPlayer({ audioUrl }) {
  const [audioRate, setAudioRate] = useState(1);
  const audioRef = useRef(null);

  useEffect(() => {
    setAudioRate(1);
  }, [audioUrl]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = audioRate;
    }
  }, [audioRate, audioUrl]);

  if (!audioUrl) {
    return null;
  }

  return (
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
      <audio ref={audioRef} controls src={audioUrl} className="market-news-audio-player" />
    </div>
  );
}

function BlogAttachmentsCard({ attachments, emptyText = "", onRemove }) {
  const items = Array.isArray(attachments) ? attachments : [];
  if (!items.length && !emptyText) {
    return null;
  }

  return (
    <div className="market-news-attachments-card">
      <strong>Anexos</strong>
      {items.length ? (
        <div className="market-news-attachments-list">
          {items.map((attachment) => {
            const attachmentUrl = getAttachmentUrl(attachment);
            return (
              <div key={attachment.id} className="market-news-attachment-item">
                <button
                  type="button"
                  className="market-news-attachment-link"
                  onClick={() => openAttachmentPopup(attachmentUrl)}
                >
                  {attachment.original_name}
                </button>
                {onRemove ? (
                  <button type="button" className="btn btn-secondary" onClick={() => onRemove(attachment.id)}>
                    Remover
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="market-news-empty">{emptyText}</div>
      )}
    </div>
  );
}

function BlogQuotesStrip({ rows, onOpen }) {
  const marqueeRepeatCount = 7;
  const marqueeCenterSequenceIndex = Math.floor(marqueeRepeatCount / 2);
  const marqueeRef = useRef(null);
  const marqueeTrackRef = useRef(null);
  const marqueeSequenceRef = useRef(null);
  const marqueeDragStateRef = useRef({ active: false, moved: false, startX: 0, startScrollLeft: 0 });
  const [isMarqueeInteracting, setIsMarqueeInteracting] = useState(false);
  const [isMarqueeHovered, setIsMarqueeHovered] = useState(false);

  const carouselRows = useMemo(() => {
    const sectionStats = (Array.isArray(rows) ? rows : []).reduce((acc, row) => {
      const label = String(row?.section_name || row?.ticker || "Mercado").trim() || "Mercado";
      const normalizedLabel = label.toLowerCase();
      const price = parseQuoteNumber(row?.price);
      if (!row?.ticker || !Number.isFinite(price)) {
        return acc;
      }
      if (!normalizedLabel || ["indices", "índices", "soja b3", "sem secao"].includes(normalizedLabel)) {
        return acc;
      }
      if (!acc[label]) {
        acc[label] = { label, firstRow: row };
        return acc;
      }
      const currentFirstOrder = Number(acc[label].firstRow?.sort_order || Number.MAX_SAFE_INTEGER);
      const nextOrder = Number(row?.sort_order || Number.MAX_SAFE_INTEGER);
      if (nextOrder < currentFirstOrder) {
        acc[label].firstRow = row;
      }
      return acc;
    }, {});

    return Object.values(sectionStats).map((item) => ({
      key: item.label,
      label: item.label,
      firstRow: item.firstRow,
    }));
  }, [rows]);

  const marqueeRows = useMemo(
    () => (carouselRows.length > 1 ? Array.from({ length: marqueeRepeatCount }, () => carouselRows) : [carouselRows]),
    [carouselRows, marqueeRepeatCount],
  );

  const getMarqueeLoopWidth = () => {
    const track = marqueeTrackRef.current;
    const sequence = marqueeSequenceRef.current;
    if (!track || !sequence || typeof window === "undefined") {
      return 0;
    }
    const styles = window.getComputedStyle(track);
    const gap = Number.parseFloat(styles.columnGap || styles.gap || "0") || 0;
    return sequence.offsetWidth + gap;
  };

  const normalizeMarqueeScroll = () => {
    const container = marqueeRef.current;
    const loopWidth = getMarqueeLoopWidth();
    if (!container || !loopWidth) {
      return;
    }

    const minScroll = loopWidth;
    const maxScroll = Math.max(loopWidth * (marqueeRows.length - 2), minScroll);

    while (container.scrollLeft >= maxScroll) {
      container.scrollLeft -= loopWidth;
    }

    while (container.scrollLeft < minScroll) {
      container.scrollLeft += loopWidth;
    }
  };

  const beginMarqueeInteraction = (clientX, scrollLeft) => {
    marqueeDragStateRef.current = {
      active: true,
      moved: false,
      startX: clientX,
      startScrollLeft: scrollLeft,
    };
  };

  const stopMarqueeInteraction = () => {
    marqueeDragStateRef.current = {
      active: false,
      moved: false,
      startX: 0,
      startScrollLeft: marqueeRef.current?.scrollLeft || 0,
    };
    setIsMarqueeInteracting(false);
  };

  const handleMarqueeMouseDown = (event) => {
    const container = marqueeRef.current;
    if (!container || carouselRows.length <= 1 || event.button !== 0) {
      return;
    }
    beginMarqueeInteraction(event.clientX, container.scrollLeft);
  };

  const handleMarqueeMouseMove = (event) => {
    const container = marqueeRef.current;
    const drag = marqueeDragStateRef.current;
    if (!container || !drag.active) {
      return;
    }
    const deltaX = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(deltaX) < 6) {
      return;
    }
    if (!drag.moved) {
      marqueeDragStateRef.current = { ...drag, moved: true };
      setIsMarqueeInteracting(true);
    }
    container.scrollLeft = drag.startScrollLeft - deltaX;
    normalizeMarqueeScroll();
  };

  const handleMarqueeTouchStart = (event) => {
    const container = marqueeRef.current;
    const touch = event.touches?.[0];
    if (!container || !touch || carouselRows.length <= 1) {
      return;
    }
    beginMarqueeInteraction(touch.clientX, container.scrollLeft);
  };

  const handleMarqueeTouchMove = (event) => {
    const container = marqueeRef.current;
    const touch = event.touches?.[0];
    const drag = marqueeDragStateRef.current;
    if (!container || !touch || !drag.active) {
      return;
    }
    const deltaX = touch.clientX - drag.startX;
    if (!drag.moved && Math.abs(deltaX) < 6) {
      return;
    }
    if (!drag.moved) {
      marqueeDragStateRef.current = { ...drag, moved: true };
      setIsMarqueeInteracting(true);
    }
    if (event.cancelable) {
      event.preventDefault();
    }
    container.scrollLeft = drag.startScrollLeft - deltaX;
    normalizeMarqueeScroll();
  };

  useEffect(() => {
    if (carouselRows.length <= 1) {
      const container = marqueeRef.current;
      if (container) {
        container.scrollLeft = 0;
      }
      return undefined;
    }

    const container = marqueeRef.current;
    if (!container || typeof window === "undefined") {
      return undefined;
    }

    let animationFrameId = 0;
    let lastTimestamp = 0;
    const speedPxPerSecond = 28;

    const step = (timestamp) => {
      if (!container) {
        return;
      }
      if (!lastTimestamp) {
        lastTimestamp = timestamp;
      }
      const delta = timestamp - lastTimestamp;
      lastTimestamp = timestamp;

      if (!marqueeDragStateRef.current.active && !isMarqueeHovered) {
        container.scrollLeft += (delta * speedPxPerSecond) / 1000;
        normalizeMarqueeScroll();
      }

      animationFrameId = window.requestAnimationFrame(step);
    };

    const handleResize = () => {
      normalizeMarqueeScroll();
    };

    const loopWidth = getMarqueeLoopWidth();
    const startingScroll = loopWidth * marqueeCenterSequenceIndex;
    if (loopWidth && container.scrollLeft < loopWidth) {
      container.scrollLeft = startingScroll;
    }
    normalizeMarqueeScroll();
    animationFrameId = window.requestAnimationFrame(step);
    window.addEventListener("resize", handleResize);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
    };
  }, [carouselRows.length, isMarqueeHovered, marqueeCenterSequenceIndex, marqueeRows.length]);

  if (!carouselRows.length) {
    return null;
  }

  return (
    <section className="resource-filter-panel risk-kpi-quotes-strip blog-studio-quotes-strip">
      <div
        ref={marqueeRef}
        className={`resource-filter-marquee risk-kpi-quotes-strip-marquee${isMarqueeInteracting ? " is-interacting" : ""}`}
        onMouseDown={handleMarqueeMouseDown}
        onMouseMove={handleMarqueeMouseMove}
        onMouseUp={stopMarqueeInteraction}
        onMouseEnter={() => setIsMarqueeHovered(true)}
        onMouseLeave={() => {
          stopMarqueeInteraction();
          setIsMarqueeHovered(false);
        }}
        onTouchStart={handleMarqueeTouchStart}
        onTouchMove={handleMarqueeTouchMove}
        onTouchEnd={stopMarqueeInteraction}
        onTouchCancel={stopMarqueeInteraction}
        onScroll={normalizeMarqueeScroll}
      >
        <div ref={marqueeTrackRef} className="resource-filter-track">
          {marqueeRows.map((sequence, sequenceIndex) => (
            <div
              key={`blog-quotes-sequence-${sequenceIndex}`}
              ref={sequenceIndex === 0 ? marqueeSequenceRef : undefined}
              className="resource-filter-sequence"
              aria-hidden={sequenceIndex > 0 ? "true" : undefined}
            >
              {sequence.map((item) => {
                const changeValue = parseQuoteNumber(item.firstRow?.change_value);
                const toneClass = changeValue > 0 ? " is-positive" : changeValue < 0 ? " is-negative" : "";
                return (
                  <button
                    type="button"
                    className="resource-filter-card risk-kpi-quotes-strip-card"
                    key={`${item.key}-${sequenceIndex}`}
                    onClick={() => onOpen?.(item.label)}
                  >
                    <span className="resource-filter-card-label">{item.label}</span>
                    <strong>{formatQuoteNumber(item.firstRow?.price, 2)}</strong>
                    <span className={`resource-filter-card-variation${toneClass}`}>
                      {Number.isFinite(changeValue)
                        ? `${formatSignedQuoteNumber(item.firstRow?.change_value, 2)} (${formatSignedQuoteNumber(item.firstRow?.change_percent, 2)}%)`
                        : "Sem variacao"}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BlogComposer({
  initialPost,
  existingCategories,
  attachments,
  onClose,
  onSave,
  onRemoveAttachment,
  onDraftCreated,
  onAttachmentsUploaded,
  isSaving = false,
}) {
  const [form, setForm] = useState(toEditorState(initialPost));
  const [newCategory, setNewCategory] = useState("");
  const [attachmentFiles, setAttachmentFiles] = useState([]);
  const [htmlDialogOpen, setHtmlDialogOpen] = useState(false);
  const [htmlDraft, setHtmlDraft] = useState("");
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [formError, setFormError] = useState("");
  const quillRef = useRef(null);
  const quillHostRef = useRef(null);
  const quillToolbarRef = useRef(null);
  const savedRangeRef = useRef(null);
  const imageInputRef = useRef(null);
  const attachmentInputRef = useRef(null);
  const audioInputRef = useRef(null);

  const visibleEditorAttachments = useMemo(
    () => filterStandaloneAttachments(attachments, form.conteudo_html, form.inline_attachment_ids),
    [attachments, form.conteudo_html, form.inline_attachment_ids],
  );
  const categoryOptions = useMemo(
    () => normalizeCategories([...(existingCategories || []), ...(form.categorias || [])]),
    [existingCategories, form.categorias],
  );

  useEffect(() => {
    const nextState = toEditorState(initialPost);
    setForm(nextState);
    setNewCategory("");
    setAttachmentFiles([]);
    setHtmlDialogOpen(false);
    setHtmlDraft("");
    setUploadError("");
    setFormError("");
    if (quillRef.current) {
      quillRef.current.setText("", "silent");
      if (nextState.conteudo_html) {
        quillRef.current.clipboard.dangerouslyPasteHTML(0, nextState.conteudo_html, "silent");
      }
      const lastIndex = Math.max(0, quillRef.current.getLength() - 1);
      quillRef.current.setSelection(lastIndex, 0, "silent");
      savedRangeRef.current = { index: lastIndex, length: 0 };
    }
  }, [initialPost]);

  useEffect(() => {
    if (!quillHostRef.current || quillRef.current) {
      return undefined;
    }
    const quill = new Quill(quillHostRef.current, {
      theme: "snow",
      placeholder: "Escreva o conteúdo do post aqui...",
      modules: {
        toolbar: {
          container: quillToolbarRef.current,
          handlers: {
            image: () => imageInputRef.current?.click(),
          },
        },
      },
    });
    quillRef.current = quill;

    if (form.conteudo_html) {
      quill.clipboard.dangerouslyPasteHTML(0, form.conteudo_html, "silent");
    }

    const handleTextChange = () => {
      const nextHtml = normalizeEditorHtml(quill.root.innerHTML);
      const nextInlineAttachmentIds = getInlineAttachmentIds(nextHtml);
      setForm((current) => ({ ...current, conteudo_html: nextHtml, inline_attachment_ids: nextInlineAttachmentIds }));
    };

    const handleSelectionChange = (range) => {
      if (range) {
        savedRangeRef.current = range;
      }
    };

    const handlePaste = async (event) => {
      const imageFiles = Array.from(event.clipboardData?.items || [])
        .filter((item) => item.kind === "file" && String(item.type || "").startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter(Boolean);
      if (!imageFiles.length) {
        return;
      }
      event.preventDefault();
      await uploadImagesAndInsert(imageFiles);
    };

    quill.on("text-change", handleTextChange);
    quill.on("selection-change", handleSelectionChange);
    quill.root.addEventListener("paste", handlePaste);

    return () => {
      quill.off("text-change", handleTextChange);
      quill.off("selection-change", handleSelectionChange);
      quill.root.removeEventListener("paste", handlePaste);
      quillRef.current = null;
      if (quillHostRef.current) {
        quillHostRef.current.innerHTML = "";
      }
    };
  }, []);

  const syncEditorHtml = () => {
    const nextHtml = normalizeEditorHtml(quillRef.current?.root?.innerHTML || "");
    const nextInlineAttachmentIds = getInlineAttachmentIds(nextHtml);
    setForm((current) => ({ ...current, conteudo_html: nextHtml, inline_attachment_ids: nextInlineAttachmentIds }));
    return nextHtml;
  };

  const focusEditor = () => {
    quillRef.current?.focus();
  };

  const getEditorRange = () => {
    const quill = quillRef.current;
    if (!quill) {
      return { index: 0, length: 0 };
    }
    const liveRange = quill.getSelection(true);
    if (liveRange) {
      savedRangeRef.current = liveRange;
      return liveRange;
    }
    if (savedRangeRef.current) {
      return savedRangeRef.current;
    }
    return { index: Math.max(0, quill.getLength() - 1), length: 0 };
  };

  const insertHtml = (html) => {
    if (!html) {
      return;
    }
    const quill = quillRef.current;
    if (!quill) {
      return;
    }
    const range = getEditorRange();
    quill.insertEmbed(range.index, "htmlEmbed", html, "user");
    quill.insertText(range.index + 1, "\n", "user");
    const nextIndex = range.index + 2;
    quill.setSelection(nextIndex, 0, "silent");
    savedRangeRef.current = { index: nextIndex, length: 0 };
    syncEditorHtml();
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

  const ensurePersistedPost = async () => {
    if (form.id) {
      return form.id;
    }
    const html = syncEditorHtml();
    const fallbackTitle = String(form.titulo || "").trim() || "Rascunho sem título";
    const draftPayload = normalizeSavePayload({ ...form, titulo: fallbackTitle }, html);
    const created = await resourceService.create("market-news-posts", draftPayload);
    setForm((current) => ({
      ...current,
      id: created?.id || current.id,
      titulo: current.titulo || created?.titulo || fallbackTitle,
      data_publicacao: created?.data_publicacao ? toLocalDatetimeValue(created.data_publicacao) : current.data_publicacao,
      inline_attachment_ids: Array.isArray(created?.inline_attachment_ids) ? created.inline_attachment_ids : current.inline_attachment_ids,
      status_artigo: created?.status_artigo || current.status_artigo,
    }));
    onDraftCreated?.(created);
    return created?.id;
  };

  const uploadImagesAndInsert = async (files) => {
    const imageFiles = (Array.isArray(files) ? files : []).filter((file) => file && String(file.type || "").startsWith("image/"));
    if (!imageFiles.length) {
      return;
    }

    setUploadError("");
    setIsUploadingMedia(true);
    try {
      const postId = await ensurePersistedPost();
      const preparedFiles = await optimizeUploadFiles(imageFiles);
      const createdAttachments = await resourceService.uploadAttachments("market-news-posts", postId, preparedFiles);
      const nextAttachments = Array.isArray(createdAttachments) ? createdAttachments : [];
      onAttachmentsUploaded?.(nextAttachments);
      const quill = quillRef.current;
      if (!quill) {
        return;
      }
      let insertAt = getEditorRange().index;
      nextAttachments.forEach((attachment) => {
        const imageUrl = getAttachmentUrl(attachment);
        if (!imageUrl) {
          return;
        }
        quill.insertEmbed(insertAt, "image", imageUrl, "user");
        insertAt += 1;
        quill.insertText(insertAt, "\n", "user");
        insertAt += 1;
      });
      quill.setSelection(insertAt, 0, "silent");
      savedRangeRef.current = { index: insertAt, length: 0 };
      syncEditorHtml();
    } catch {
      setUploadError("Nao foi possivel enviar a imagem colada. Tente novamente.");
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (isSaving || isUploadingMedia) {
      return;
    }
    const html = syncEditorHtml();
    if (!String(form.titulo || "").trim()) {
      setFormError("Informe um título para o post.");
      return;
    }
    setFormError("");
    onSave(normalizeSavePayload(form, html), form.id, { attachmentFiles });
  };

  return (
    <div className="blog-studio-main-panel">
      <form className="market-news-editor-panel blog-studio-editor-panel" onSubmit={handleSubmit}>
        <div className="blog-studio-panel-header">
          <div>
            <strong>{form.id ? "Editar post" : "Novo post"}</strong>
            <div className="muted">Texto livre com HTML embutido, controle de fonte e cor, imagem colada, anexos e audio.</div>
            {isUploadingMedia ? <div className="muted">Enviando imagem para o corpo do post...</div> : null}
          </div>
          <div className="modal-header-actions">
            <button className="btn btn-secondary" type="button" onClick={onClose} disabled={isSaving || isUploadingMedia}>
              Fechar
            </button>
            <button className="btn btn-primary" type="submit" disabled={isSaving || isUploadingMedia}>
              {isSaving ? "Salvando..." : isUploadingMedia ? "Enviando imagem..." : "Salvar post"}
            </button>
          </div>
        </div>

        {formError ? <div className="form-error">{formError}</div> : null}
        {uploadError ? <div className="form-error">{uploadError}</div> : null}

        <div className="blog-studio-composer-layout">
          <aside className="blog-studio-side-fields">
            <div className="field blog-studio-form-field is-title">
              <label>Título</label>
              <input
                className="form-control"
                value={form.titulo}
                onChange={(event) => {
                  setFormError("");
                  setForm((current) => ({ ...current, titulo: event.target.value }));
                }}
                placeholder="Digite o título principal do post"
              />
            </div>

            <div className="field blog-studio-form-field is-compact">
              <label>Status</label>
              <select
                className="form-control"
                value={form.status_artigo}
                onChange={(event) => setForm((current) => ({ ...current, status_artigo: event.target.value }))}
              >
                <option value="draft">Rascunho</option>
                <option value="published">Publicado</option>
              </select>
            </div>

            <div className="field blog-studio-form-field is-compact">
              <label>Data de publicação</label>
              <input
                className="form-control"
                type="datetime-local"
                value={form.data_publicacao}
                onChange={(event) => setForm((current) => ({ ...current, data_publicacao: event.target.value }))}
              />
            </div>

            <div className="field blog-studio-form-field is-wide">
              <label>Categorias</label>
              <div className="market-news-category-chip-list">
                {categoryOptions.length ? (
                  categoryOptions.map((category) => {
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
                  })
                ) : (
                  <span className="muted">Nenhuma categoria cadastrada ainda.</span>
                )}
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
            </div>

            <div className="field blog-studio-form-field is-wide">
              <label>Mídia e arquivos</label>
              <div className="market-news-file-actions blog-studio-file-actions">
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => {
                    const liveRange = quillRef.current?.getSelection(true);
                    if (liveRange) {
                      savedRangeRef.current = liveRange;
                    }
                    imageInputRef.current?.click();
                  }}
                >
                  Inserir imagem
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => attachmentInputRef.current?.click()}>
                  Inserir anexo
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => audioInputRef.current?.click()}>
                  Inserir audio
                </button>
              </div>
              <div className="blog-studio-help-text">Voce tambem pode colar imagens direto no corpo do texto.</div>
            </div>

            <div className="field blog-studio-form-field is-wide">
              <label>Audio selecionado</label>
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
                {!form.audio || form.remove_audio ? <div className="muted">Nenhum audio vinculado.</div> : null}
              </div>
            </div>

            <div className="blog-studio-form-block is-wide">
              <BlogAttachmentsCard attachments={visibleEditorAttachments} emptyText="Nenhum anexo avulso vinculado." onRemove={onRemoveAttachment} />
            </div>

            {attachmentFiles.length ? (
              <div className="market-news-attachments-card blog-studio-form-block is-wide">
                <strong>Anexos pendentes</strong>
                <div className="market-news-attachments-list">
                  {attachmentFiles.map((file) => (
                    <div className="market-news-attachment-item" key={`${file.name}-${file.size}-${file.lastModified}`}>
                      <span className="market-news-attachment-link">{file.name}</span>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setAttachmentFiles((current) => current.filter((item) => item !== file))}
                      >
                        Tirar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </aside>

          <div className="blog-studio-editor-column">
            <div className="blog-studio-quill-toolbar-shell">
              <div ref={quillToolbarRef} className="blog-studio-quill-toolbar">
                <span className="ql-formats">
                  <select className="ql-font" defaultValue="">
                    <option value="">Sans</option>
                    <option value="serif">Serif</option>
                    <option value="monospace">Mono</option>
                  </select>
                  <select className="ql-size" defaultValue="">
                    <option value="small">P</option>
                    <option value="">Normal</option>
                    <option value="large">G</option>
                    <option value="huge">GG</option>
                  </select>
                  <select className="ql-header" defaultValue="">
                    <option value="1">H1</option>
                    <option value="2">H2</option>
                    <option value="">P</option>
                  </select>
                </span>

                <span className="ql-formats">
                  <button type="button" className="ql-bold" aria-label="Negrito" />
                  <button type="button" className="ql-italic" aria-label="Italico" />
                  <button type="button" className="ql-underline" aria-label="Sublinhado" />
                </span>

                <span className="ql-formats">
                  <button type="button" className="ql-list" value="ordered" aria-label="Lista numerada" />
                  <button type="button" className="ql-list" value="bullet" aria-label="Lista com marcadores" />
                  <button type="button" className="ql-blockquote" aria-label="Citacao" />
                  <button type="button" className="ql-code-block" aria-label="Codigo" />
                </span>

                <span className="ql-formats">
                  <button type="button" className="ql-link" aria-label="Link" />
                  <button type="button" className="ql-image" aria-label="Imagem" />
                </span>

                <span className="ql-formats">
                  <select className="ql-color" />
                  <select className="ql-background" />
                  <select className="ql-align" />
                </span>
              </div>

              <div className="blog-studio-quill-toolbar-actions">
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => {
                    const liveRange = quillRef.current?.getSelection(true);
                    if (liveRange) {
                      savedRangeRef.current = liveRange;
                    }
                    setHtmlDialogOpen(true);
                  }}
                >
                  Inserir HTML
                </button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => {
                    quillRef.current?.focus();
                    const range = getEditorRange();
                    quillRef.current?.removeFormat(range.index, Math.max(range.length, 1), "user");
                    syncEditorHtml();
                  }}
                >
                  Limpar formato
                </button>
              </div>
            </div>

            <div className="blog-studio-help-text">Voce pode digitar, colar imagem direto no texto e inserir embed HTML no ponto do cursor.</div>

            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="market-news-hidden-input"
              onChange={async (event) => {
                const files = Array.from(event.target.files || []);
                if (files.length) {
                  await uploadImagesAndInsert(files);
                }
                event.target.value = "";
              }}
            />
            <input
              ref={attachmentInputRef}
              type="file"
              multiple
              className="market-news-hidden-input"
              onChange={async (event) => {
                const files = Array.from(event.target.files || []);
                if (files.length) {
                  const preparedFiles = await optimizeUploadFiles(files);
                  setAttachmentFiles((current) => [...current, ...preparedFiles]);
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

            <div className="blog-studio-rich-editor-shell">
              <div ref={quillHostRef} className="blog-studio-rich-editor" />
            </div>
          </div>
        </div>
      </form>

      {htmlDialogOpen ? (
        <div className="market-news-html-dialog">
          <div className="market-news-html-dialog-card">
            <div className="market-news-html-dialog-header">
              <strong>Inserir embed HTML</strong>
              <button className="btn btn-secondary" type="button" onClick={() => setHtmlDialogOpen(false)}>
                Fechar
              </button>
            </div>
            <textarea
              className="form-control form-control-textarea market-news-html-textarea"
              value={htmlDraft}
              onChange={(event) => setHtmlDraft(event.target.value)}
              placeholder="Cole aqui o HTML que deve entrar no meio do corpo do post"
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

function BlogNewsListItem({ post, active, canManagePosts, onOpen, onEdit, onDuplicate, onDelete }) {
  const dateParts = getDateParts(resolvePostDate(post));
  const authorName = post.published_by_name || post.created_by_name || "Equipe";
  const updatedLabel = formatPostUpdatedAt(post.updated_at || post.created_at || resolvePostDate(post));

  return (
    <article className={`blog-studio-news-row${active ? " is-active" : ""}`}>
      <button type="button" className="blog-studio-news-open" onClick={() => onOpen(post)}>
        <div className="blog-studio-news-date">
          <strong>{dateParts.day}</strong>
          <span>{dateParts.month}</span>
          <small>{dateParts.year}</small>
        </div>
        <div className="blog-studio-news-body">
          <strong className="blog-studio-news-title">{post.titulo || "Sem título"}</strong>
          <div className="blog-studio-news-meta">
            <span>{`Por usuario (${authorName}), atualizado em ${updatedLabel || "--"}`}</span>
            {post.status_artigo === "draft" ? <span className="blog-studio-post-card-status">Rascunho</span> : null}
          </div>
          <p className="blog-studio-news-excerpt">{buildExcerpt(post) || "Sem conteúdo ainda."}</p>
        </div>
      </button>

      {canManagePosts ? (
        <div className="blog-studio-row-actions">
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => onEdit(post)}
          >
            Editar
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => onDuplicate(post)}
          >
            Duplicar
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => onDelete(post)}
          >
            Excluir
          </button>
        </div>
      ) : null}
    </article>
  );
}

function BlogPlaceholder({ canManagePosts, onCreatePost }) {
  return (
    <div className="blog-studio-placeholder">
      <span className="blog-studio-placeholder-tag">Novo app editorial</span>
      <h3>Selecione um post para visualizar ou editar</h3>
      <p>Este fluxo editorial foi reconstruido com editor rico, embed HTML, imagens coladas, anexos e audio em um mesmo lugar.</p>
      {canManagePosts ? (
        <button className="btn btn-primary" type="button" onClick={onCreatePost}>
          Criar novo post
        </button>
      ) : null}
    </div>
  );
}

export function BlogStudioPage({ basePath = "/mercado/blog" }) {
  const { user } = useAuth();
  const isPublicSurface = basePath === "/blog" || !user;
  const navigate = useNavigate();
  const { postId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [posts, setPosts] = useState([]);
  const [postAttachments, setPostAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPostLoading, setSelectedPostLoading] = useState(false);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [error, setError] = useState("");
  const [editorState, setEditorState] = useState(null);
  const [selectedPostDetail, setSelectedPostDetail] = useState(null);
  const [isSavingPost, setIsSavingPost] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [quoteRows, setQuoteRows] = useState([]);
  const [isFeedCollapsed, setIsFeedCollapsed] = useState(false);
  const [isQuotesPopupOpen, setIsQuotesPopupOpen] = useState(false);
  const [quotesPopupSearch, setQuotesPopupSearch] = useState("");

  const requestParams = useMemo(() => (isPublicSurface ? { public: 1 } : {}), [isPublicSurface]);
  const activeCategory = searchParams.get("categoria") || "";
  const currentSearch = searchParams.toString();
  const backToListUrl = currentSearch ? `${basePath}?${currentSearch}` : basePath;
  const canManagePosts = !isPublicSurface && Boolean(user?.is_superuser || ["owner", "manager"].includes(user?.role));

  const loadPosts = async ({ force = false } = {}) => {
    setLoading(true);
    setError("");
    try {
      const items = await resourceService.listAll("market-news-posts", requestParams, { force });
      setPosts(Array.isArray(items) ? items : []);
    } catch {
      setError("Não foi possível carregar os posts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosts();
  }, [basePath]);

  useEffect(() => {
    let isMounted = true;
    const loadQuotes = async (force = false) => {
      try {
        const items = await resourceService.listTradingviewQuotes(force ? { force: true } : {});
        if (isMounted) {
          setQuoteRows(Array.isArray(items) ? items : []);
        }
      } catch {
        if (isMounted) {
          setQuoteRows([]);
        }
      }
    };

    loadQuotes();
    const intervalId = window.setInterval(() => {
      loadQuotes(true);
    }, TRADINGVIEW_REFRESH_MS);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const categoryPool = useMemo(() => {
    const categories = posts.flatMap((post) => (Array.isArray(post.categorias) ? post.categorias : []));
    return normalizeCategories(categories).sort((left, right) => left.localeCompare(right, "pt-BR", { sensitivity: "base" }));
  }, [posts]);

  const filteredPosts = useMemo(() => {
    const normalizedSearch = String(searchText || "").trim().toLowerCase();
    const sorted = [...posts].sort(
      (left, right) => new Date(resolvePostDate(right) || 0) - new Date(resolvePostDate(left) || 0),
    );

    return sorted.filter((post) => {
      const categoryMatch = !activeCategory
        || (Array.isArray(post.categorias) ? post.categorias : []).some(
          (category) => String(category).toLowerCase() === activeCategory.toLowerCase(),
        );

      if (!categoryMatch) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        post.titulo,
        buildExcerpt(post),
        ...(Array.isArray(post.categorias) ? post.categorias : []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [activeCategory, posts, searchText]);
  const listPosts = useMemo(
    () => filteredPosts.filter((post) => canManagePosts || post.status_artigo !== "draft"),
    [canManagePosts, filteredPosts],
  );

  const selectedPostSummary = useMemo(
    () => posts.find((item) => String(item.id) === String(postId)) || null,
    [posts, postId],
  );
  const selectedPost = selectedPostDetail || selectedPostSummary;
  const visibleAttachments = useMemo(
    () =>
      filterStandaloneAttachments(
        postAttachments,
        editorState?.conteudo_html || selectedPost?.conteudo_html || "",
        editorState?.inline_attachment_ids || selectedPost?.inline_attachment_ids || [],
      ),
    [editorState?.conteudo_html, editorState?.inline_attachment_ids, postAttachments, selectedPost?.conteudo_html, selectedPost?.inline_attachment_ids],
  );

  useEffect(() => {
    if (!postId) {
      setSelectedPostDetail(null);
      setSelectedPostLoading(false);
      return;
    }
    setSelectedPostLoading(true);
    resourceService
      .getOne("market-news-posts", postId, { params: requestParams })
      .then((item) => setSelectedPostDetail(item || null))
      .catch(() => setSelectedPostDetail(null))
      .finally(() => setSelectedPostLoading(false));
  }, [postId, isPublicSurface]);

  useEffect(() => {
    if (!postId || loading || selectedPostLoading) {
      return;
    }
    if (!selectedPostSummary && !selectedPostDetail) {
      navigate(backToListUrl, { replace: true });
    }
  }, [backToListUrl, loading, navigate, postId, selectedPostDetail, selectedPostLoading, selectedPostSummary]);

  useEffect(() => {
    const currentPostId = editorState?.id || selectedPost?.id;
    if (!currentPostId) {
      setPostAttachments([]);
      setAttachmentsLoading(false);
      return;
    }

    setAttachmentsLoading(true);
    resourceService
      .listAttachments("market-news-posts", currentPostId, { force: true, params: requestParams })
      .then((items) => setPostAttachments(Array.isArray(items) ? items : []))
      .catch(() => setPostAttachments([]))
      .finally(() => setAttachmentsLoading(false));
  }, [editorState?.id, selectedPost?.id, isPublicSurface]);

  const updateCategoryFilter = (category) => {
    const nextParams = new URLSearchParams(searchParams);
    if (category) {
      nextParams.set("categoria", category);
    } else {
      nextParams.delete("categoria");
    }
    setSearchParams(nextParams);
  };

  const handleOpenPost = (post) => {
    if (!post?.id) {
      return;
    }
    setEditorState(null);
    navigate(`${basePath}/${post.id}${currentSearch ? `?${currentSearch}` : ""}`);
  };

  const handleCreatePost = () => {
    setEditorState({});
    setError("");
    navigate(backToListUrl);
  };

  const handleEditPost = async (postOverride = selectedPost) => {
    if (!canManagePosts || !postOverride?.id) {
      return;
    }
    if (postOverride?.conteudo_html) {
      setSelectedPostDetail(postOverride);
      setEditorState(postOverride);
      navigate(`${basePath}/${postOverride.id}${currentSearch ? `?${currentSearch}` : ""}`);
      return;
    }
    setSelectedPostLoading(true);
    try {
      const item = await resourceService.getOne("market-news-posts", postOverride.id, { force: true });
      setSelectedPostDetail(item || null);
      setEditorState(item || null);
      navigate(`${basePath}/${postOverride.id}${currentSearch ? `?${currentSearch}` : ""}`);
    } catch {
      setError("Não foi possível abrir o editor para esse post.");
    } finally {
      setSelectedPostLoading(false);
    }
  };

  const handleSavePost = async (payload, currentPostId, options = {}) => {
    setIsSavingPost(true);
    setError("");
    try {
      let saved = null;
      if (currentPostId) {
        saved = await resourceService.patch("market-news-posts", currentPostId, payload);
      } else {
        saved = await resourceService.create("market-news-posts", payload);
      }
      if (options.attachmentFiles?.length && saved?.id) {
        await resourceService.uploadAttachments("market-news-posts", saved.id, options.attachmentFiles);
      }

      resourceService.invalidateCache("market-news-posts");
      resourceService.invalidateCache("attachments");
      setSelectedPostDetail(saved || null);
      setEditorState(null);
      await loadPosts({ force: true });

      if (saved?.id) {
        navigate(`${basePath}/${saved.id}${currentSearch ? `?${currentSearch}` : ""}`, { replace: true });
      } else {
        navigate(backToListUrl, { replace: true });
      }
    } catch {
      setError("Não foi possível salvar o post.");
    } finally {
      setIsSavingPost(false);
    }
  };

  const handleDuplicatePost = async (postOverride = selectedPost) => {
    if (!postOverride?.id || !canManagePosts) {
      return;
    }
    setError("");
    try {
      const original = await resourceService.getOne("market-news-posts", postOverride.id, { force: true });
      const source = original || postOverride;
      const baseTitle = String(source.titulo || "").trim() || "Sem titulo";
      const payload = {
        titulo: `${baseTitle} (cópia)`,
        categorias: normalizeCategories(source.categorias || []),
        status_artigo: "draft",
        data_publicacao: new Date().toISOString(),
        conteudo_html: String(source.conteudo_html || ""),
        inline_attachment_ids: [],
      };
      const created = await resourceService.create("market-news-posts", payload);
      resourceService.invalidateCache("market-news-posts");
      await loadPosts({ force: true });
      if (created?.id) {
        navigate(`${basePath}/${created.id}${currentSearch ? `?${currentSearch}` : ""}`);
      }
    } catch {
      setError("Não foi possível duplicar o post.");
    }
  };

  const handleDeletePost = async (postOverride = selectedPost) => {
    if (!postOverride?.id || !canManagePosts) {
      return;
    }
    const confirmed = window.confirm(`Excluir o post "${postOverride.titulo}"?`);
    if (!confirmed) {
      return;
    }
    try {
      await resourceService.remove("market-news-posts", postOverride.id);
      resourceService.invalidateCache("market-news-posts");
      resourceService.invalidateCache("attachments");
      if (String(postOverride.id) === String(selectedPost?.id)) {
        setSelectedPostDetail(null);
        setEditorState(null);
        navigate(backToListUrl, { replace: true });
      }
      await loadPosts();
    } catch {
      setError("Não foi possível excluir o post.");
    }
  };

  const handleRemoveAttachment = async (attachmentId) => {
    if (!attachmentId) {
      return;
    }
    try {
      await resourceService.remove("attachments", attachmentId);
      const currentPostId = editorState?.id || selectedPost?.id;
      if (!currentPostId) {
        return;
      }
      const items = await resourceService.listAttachments("market-news-posts", currentPostId, { force: true });
      setPostAttachments(Array.isArray(items) ? items : []);
    } catch {
      setError("Não foi possível remover o anexo.");
    }
  };

  const handleDraftCreated = (draft) => {
    if (!draft?.id) {
      return;
    }
    setEditorState((current) => ({
      ...(current || {}),
      ...draft,
    }));
  };

  const handleAttachmentsUploaded = (createdAttachments = []) => {
    if (!Array.isArray(createdAttachments) || !createdAttachments.length) {
      return;
    }
    setPostAttachments((current) => [...createdAttachments, ...current]);
  };

  const feedTitle = "Categorias";
  const newsTitle = "Publicações";
  const pageTitle = isPublicSurface ? "Blog" : "Blog/News";
  const pageDescription = isPublicSurface ? "Leia os posts publicados pela equipe." : null;

  return (
    <div className="resource-page dashboard-page blog-studio-page">
      <PageHeader title={pageTitle} description={pageDescription} tag={isPublicSurface ? "Conteúdo" : "Mercado"} />

      {error ? <div className="form-error">{error}</div> : null}

      <BlogQuotesStrip
        rows={quoteRows}
        onOpen={(label) => {
          setQuotesPopupSearch(label || "");
          setIsQuotesPopupOpen(true);
        }}
      />

      {isQuotesPopupOpen ? (
        <div
          className="component-popup-backdrop blog-quotes-popup-backdrop"
          onClick={() => setIsQuotesPopupOpen(false)}
        >
          <div
            className="component-popup blog-quotes-popup"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="component-popup-close"
              onClick={() => setIsQuotesPopupOpen(false)}
              aria-label="Fechar cotacoes"
            >
              ×
            </button>
            <SimpleQuotesTable
              title="Cotacoes"
              columns={QUOTES_TABLE_COLUMNS}
              rows={quoteRows}
              searchValue={quotesPopupSearch}
              searchPlaceholder="Buscar simbolo, secao ou descricao..."
              onSearchChange={setQuotesPopupSearch}
              onClear={() => setQuotesPopupSearch("")}
              onTickerClick={(row) => openTradingviewPopupWindow(buildTradingviewChartUrl(row))}
            />
          </div>
        </div>
      ) : null}

      <section className={`blog-studio-shell${isFeedCollapsed ? " is-feed-collapsed" : ""}`}>
        <aside className={`blog-studio-feed${isFeedCollapsed ? " is-collapsed" : ""}`}>
          <button
            type="button"
            className={`blog-studio-feed-toggle-fab${isFeedCollapsed ? " collapsed" : ""}`}
            onClick={() => setIsFeedCollapsed((current) => !current)}
            aria-label={isFeedCollapsed ? "Expandir categorias" : "Recolher categorias"}
          >
            {isFeedCollapsed ? ">" : "<"}
          </button>
          {!isFeedCollapsed ? (
            <div className="blog-studio-sidebar-card blog-studio-categories-card">
              <div className="blog-studio-feed-head">
                <strong>{feedTitle}</strong>
              </div>
              <div className="blog-studio-category-list">
                <button
                  type="button"
                  className={`blog-studio-category-item${!activeCategory ? " is-active" : ""}`}
                  onClick={() => updateCategoryFilter("")}
                >
                  <span className="blog-studio-category-label">Todas</span>
                </button>
                {categoryPool.map((category) => (
                  <button
                    key={category}
                    type="button"
                    className={`blog-studio-category-item${activeCategory.toLowerCase() === category.toLowerCase() ? " is-active" : ""}`}
                    onClick={() => updateCategoryFilter(category)}
                  >
                  <span className="blog-studio-category-label">{category}</span>
                  </button>
                ))}
                {!categoryPool.length ? <div className="market-news-empty">Nenhuma categoria cadastrada ainda.</div> : null}
              </div>
            </div>
          ) : null}
        </aside>

        <div className="blog-studio-main">
          {editorState !== null ? (
            <BlogComposer
              initialPost={editorState}
              existingCategories={categoryPool}
              attachments={postAttachments}
              onClose={() => setEditorState(null)}
              onSave={handleSavePost}
              onRemoveAttachment={handleRemoveAttachment}
              onDraftCreated={handleDraftCreated}
              onAttachmentsUploaded={handleAttachmentsUploaded}
              isSaving={isSavingPost}
            />
          ) : null}

          {!editorState && selectedPostLoading ? <div className="blog-studio-main-panel market-news-empty">Carregando post...</div> : null}

          {!editorState && !selectedPost && !selectedPostLoading ? (
            <section className="blog-studio-main-panel blog-studio-news-panel">
              <div className="blog-studio-news-header">
                <div>
                  <span className="blog-studio-placeholder-tag">Fluxo editorial</span>
                  <h2 className="blog-studio-news-heading">{newsTitle}</h2>
                </div>
                <div className="blog-studio-news-header-actions">
                  <input
                    className="form-control blog-studio-search-input"
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder="Buscar por titulo, trecho ou categoria"
                  />
                  {canManagePosts ? (
                    <button className="btn btn-primary" type="button" onClick={handleCreatePost}>
                      Novo artigo
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="blog-studio-news-list">
                {loading ? <div className="market-news-empty">Carregando posts...</div> : null}
                {!loading && listPosts.map((post) => (
                  <BlogNewsListItem
                    key={post.id}
                    post={post}
                    active={false}
                    canManagePosts={canManagePosts}
                    onOpen={handleOpenPost}
                    onEdit={handleEditPost}
                    onDuplicate={handleDuplicatePost}
                    onDelete={handleDeletePost}
                  />
                ))}
                {!loading && !listPosts.length ? (
                  <div className="market-news-empty">Nenhum post encontrado com esse filtro.</div>
                ) : null}
              </div>
            </section>
          ) : null}

          {!editorState && !selectedPostLoading && selectedPost ? (
            <article className="blog-studio-main-panel blog-studio-detail-panel">
              <div className="blog-studio-panel-header">
                <div>
                  <span className="blog-studio-placeholder-tag">{selectedPost.status_artigo === "draft" ? "Rascunho" : "Publicado"}</span>
                  <h2 className="blog-studio-detail-title">{selectedPost.titulo || "Sem título"}</h2>
                  <div className="blog-studio-detail-meta">
                    <span>Por: {selectedPost.published_by_name || selectedPost.created_by_name || "Equipe"}</span>
                    <span>Publicado em: {formatPostDate(resolvePostDate(selectedPost))}</span>
                  </div>
                </div>
                <div className="blog-studio-detail-actions">
                  <button className="btn btn-secondary" type="button" onClick={() => navigate(backToListUrl)} disabled={selectedPostLoading}>
                    Voltar
                  </button>
                  {canManagePosts ? (
                    <>
                      <button className="btn btn-secondary" type="button" onClick={() => handleEditPost(selectedPost)} disabled={selectedPostLoading}>
                        Editar
                      </button>
                      <button className="btn btn-secondary" type="button" onClick={() => handleDeletePost(selectedPost)}>
                        Excluir
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              {(Array.isArray(selectedPost.categorias) ? selectedPost.categorias : []).length ? (
                <div className="blog-studio-chip-row">
                  {(Array.isArray(selectedPost.categorias) ? selectedPost.categorias : []).map((category) => (
                    <button type="button" className="blog-studio-chip is-passive" key={category} onClick={() => updateCategoryFilter(category)}>
                      {category}
                    </button>
                  ))}
                </div>
              ) : null}

              {attachmentsLoading ? <div className="market-news-empty">Carregando anexos...</div> : null}
              {!attachmentsLoading ? <BlogAttachmentsCard attachments={visibleAttachments} /> : null}
              <BlogAudioPlayer audioUrl={selectedPost.audio} />
              <div className="market-news-content" dangerouslySetInnerHTML={{ __html: selectedPost.conteudo_html || "" }} />
              {!stripHtml(selectedPost.conteudo_html || "").length ? <div className="market-news-empty">Este post ainda não possui conteúdo.</div> : null}
            </article>
          ) : null}

          {!editorState && !selectedPost && !selectedPostLoading && !loading && !listPosts.length && !searchText && !activeCategory ? (
            <BlogPlaceholder canManagePosts={canManagePosts} onCreatePost={handleCreatePost} />
          ) : null}
        </div>
      </section>
    </div>
  );
}
