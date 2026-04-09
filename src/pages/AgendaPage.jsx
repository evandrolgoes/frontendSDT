import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../services/api";

function emptyForm() {
  return {
    titulo:"", data_inicio:"", data_fim:"", hora_inicio:"09:00", hora_fim:"10:00", descricao:"", local:"",
    dia_todo:false, com_meet:false, convidados:[], config_ids:[], repeticao:"", repetir_ate:"",
  };
}

function addOneHour(time) {
  if (!time) return "10:00";
  const [h,m] = time.split(":").map(Number);
  const total = h*60 + m + 60;
  return `${String(Math.floor(total/60)%24).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`;
}
function minutesToTime(totalMinutes) {
  const safeMinutes = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(safeMinutes / 60);
  const m = safeMinutes % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MESES_CURTOS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const DIAS_SEMANA = ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];    // Monday-first
const DIAS_SEMANA_FULL = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]; // Sunday-first (JS getDay)
const HOUR_HEIGHT = 60; // px per hour
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// --- helpers ---
function mondayOfWeek(date) {
  const d = new Date(date); d.setHours(0,0,0,0);
  const dow = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d;
}
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate()+n); return d; }
function fmtDate(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function sameDay(a,b) { return a && b && a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
function parseStart(ev) { return ev.start?.dateTime ? new Date(ev.start.dateTime) : ev.start?.date ? new Date(ev.start.date+"T00:00:00") : null; }
function parseEnd(ev)   { return ev.end?.dateTime   ? new Date(ev.end.dateTime)   : ev.end?.date   ? new Date(ev.end.date+"T00:00:00")   : null; }
function isAllDay(ev)   { return !ev.start?.dateTime; }
function getDaysInMonth(y,m) { return new Date(y,m+1,0).getDate(); }
// Monday-first index of first day of month
function firstDowMonday(y,m) { return (new Date(y,m,1).getDay()+6)%7; }

const COLORS = { "1":"#7986cb","2":"#33b679","3":"#8e24aa","4":"#e67c73","5":"#f6bf26","6":"#f4511e","7":"#039be5","8":"#616161","9":"#3f51b5","10":"#0b8043","11":"#d50000" };
function evColor(ev) { return ev.colorId && COLORS[ev.colorId] ? COLORS[ev.colorId] : "#1a73e8"; }

function formatHourLabel(h) {
  if (h===0) return ""; if (h<12) return `${h} AM`; if (h===12) return "12 PM"; return `${h-12} PM`;
}
function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0,0,0,0);
  return d;
}
function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23,59,59,999);
  return d;
}
function eventOccursOnDay(ev, day) {
  const start = parseStart(ev);
  if (!start) return false;
  const end = parseEnd(ev) || start;
  return start <= endOfDay(day) && end >= startOfDay(day);
}
function compareEvents(a, b) {
  const startA = parseStart(a)?.getTime() || 0;
  const startB = parseStart(b)?.getTime() || 0;
  if (startA !== startB) return startA - startB;
  return (a.summary || "").localeCompare(b.summary || "", "pt-BR");
}
function eventsForDay(eventos, day) {
  return eventos.filter(ev => eventOccursOnDay(ev, day)).sort(compareEvents);
}
function eventPosition(ev) {
  const s=parseStart(ev), e=parseEnd(ev); if(!s||!e) return null;
  const sm = s.getHours()*60+s.getMinutes(), em = e.getHours()*60+e.getMinutes();
  return { top: sm/60*HOUR_HEIGHT, height: Math.max((Math.max(em-sm,30))/60*HOUR_HEIGHT,22) };
}
function fmtTime(dt) { return new Date(dt).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}); }
function fmtDateLong(d) { return d.toLocaleDateString("pt-BR",{day:"numeric",month:"long",year:"numeric"}); }
function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }
function normalizeText(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
function buildEventSearchText(ev) {
  return normalizeText([
    ev?.summary,
    ev?.description,
    ev?.location,
    ...(Array.isArray(ev?.attendees) ? ev.attendees.map((item) => item?.email) : []),
  ].filter(Boolean).join(" "));
}
function parseEventRecurrence(ev) {
  const rule = Array.isArray(ev?.recurrence) ? ev.recurrence.find((item) => String(item || "").startsWith("RRULE:")) : "";
  if (!rule) return { repeticao: "", repetir_ate: "" };
  const freqMatch = rule.match(/FREQ=([^;]+)/i);
  const untilMatch = rule.match(/UNTIL=(\d{8})/i);
  const freq = String(freqMatch?.[1] || "").toUpperCase();
  const untilRaw = untilMatch?.[1] || "";
  const repetir_ate = untilRaw ? `${untilRaw.slice(0,4)}-${untilRaw.slice(4,6)}-${untilRaw.slice(6,8)}` : "";
  return {
    repeticao: freq === "WEEKLY" ? "weekly" : freq === "MONTHLY" ? "monthly" : "",
    repetir_ate,
  };
}
function getEventRecurrenceLabel(ev) {
  const { repeticao, repetir_ate } = parseEventRecurrence(ev);
  if (!repeticao) return "";
  const label = repeticao === "weekly" ? "Repete semanalmente" : "Repete mensalmente";
  return repetir_ate ? `${label} até ${new Date(`${repetir_ate}T12:00:00`).toLocaleDateString("pt-BR")}` : label;
}
function getEventDateLabel(ev) {
  const start = parseStart(ev);
  const end = parseEnd(ev);
  if (!start) return "Sem data";
  if (isAllDay(ev)) {
    if (end && !sameDay(start, end)) {
      return `${fmtDateLong(start)} - ${fmtDateLong(end)}`;
    }
    return `${fmtDateLong(start)} - Dia todo`;
  }
  if (end && !sameDay(start, end)) {
    return `${fmtDateLong(start)} ${fmtTime(start)} - ${fmtDateLong(end)} ${fmtTime(end)}`;
  }
  return `${fmtDateLong(start)} ${fmtTime(start)} - ${fmtTime(end || start)}`;
}

// --- main component ---
export function AgendaPage() {
  const todayBase = new Date(); todayBase.setHours(0,0,0,0);
  const [configs, setConfigs]           = useState([]);
  const [selectedConfigIds, setSelectedConfigIds] = useState([]);
  const [eventos, setEventos]           = useState([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState("");
  const [view, setView]                 = useState("month");
  const [cur, setCur]                   = useState(new Date(todayBase));
  const [showForm, setShowForm]         = useState(false);
  const [editingEvId, setEditingEvId]   = useState(null); // null = criar, string = editar
  const [form, setForm]                 = useState(emptyForm());
  const [novoConvidado, setNovoConvidado] = useState("");
  const [saving, setSaving]             = useState(false);
  const [showConviteConfirm, setShowConviteConfirm] = useState(false);
  const [pendingSave, setPendingSave]   = useState(null);
  const [successMsg, setSuccessMsg]     = useState("");
  const [selectedEv, setSelectedEv]     = useState(null);
  const [selectedDay, setSelectedDay]   = useState(new Date(todayBase));
  const [dragState, setDragState]       = useState(null);
  const [searchTerm, setSearchTerm]     = useState("");
  const timeGridRef                     = useRef(null);
  const timeGridBodyRef                 = useRef(null);
  const suppressClickRef                = useRef(false);
  const weekDays = view==="week"
    ? Array.from({length:7},(_,i)=>addDays(mondayOfWeek(cur),i))
    : [new Date(cur)];

  // load configs
  useEffect(() => {
    api.get("/agenda-configs/").then(({ data }) => {
      const list = Array.isArray(data) ? data : (data.results||[]);
      const conn = list.filter(c=>c.conectada);
      setConfigs(conn);
      setSelectedConfigIds(conn.map((item) => item.id));
    }).catch(()=>{});
  }, []);

  // load events on config/view/date change
  useEffect(() => { if (selectedConfigIds.length) loadEventos(); else setEventos([]); }, [selectedConfigIds, cur, view]);

  // scroll to 7am on time views
  useEffect(() => {
    if ((view==="day"||view==="week") && timeGridRef.current) {
      setTimeout(() => { if (timeGridRef.current) timeGridRef.current.scrollTop = 7*HOUR_HEIGHT; }, 60);
    }
  }, [view, cur]);

  useEffect(() => {
    if (!dragState || !timeGridBodyRef.current) return undefined;

    const updateDragPosition = (clientX, clientY) => {
      const rect = timeGridBodyRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dayCount = Math.max(weekDays.length, 1);
      const dayIndex = clamp(Math.floor((clientX - rect.left) / (rect.width / dayCount)), 0, dayCount - 1);
      const minutesRaw = ((clientY - rect.top) / HOUR_HEIGHT) * 60;
      const startMinutes = clamp(Math.round(minutesRaw / 15) * 15, 0, Math.max(0, 1440 - dragState.durationMinutes));
      setDragState((current) => {
        if (!current) return current;
        return {
          ...current,
          dayIndex,
          day: new Date(weekDays[dayIndex] || weekDays[0]),
          startMinutes,
          moved:
            current.moved
            || dayIndex !== current.originalDayIndex
            || startMinutes !== current.originalStartMinutes,
        };
      });
    };

    const handlePointerMove = (event) => {
      updateDragPosition(event.clientX, event.clientY);
      suppressClickRef.current = true;
    };

    const handlePointerUp = async () => {
      const finalDrag = dragState;
      setDragState(null);
      if (finalDrag?.moved) {
        await saveDraggedEvent(finalDrag);
      }
      window.setTimeout(() => { suppressClickRef.current = false; }, 80);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    document.body.style.userSelect = "none";

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      document.body.style.userSelect = "";
    };
  }, [dragState, weekDays]);

  const getRange = () => {
    if (view==="day") { const d=new Date(cur); return {inicio:fmtDate(d),fim:fmtDate(d)}; }
    if (view==="week") { const s=mondayOfWeek(cur); return {inicio:fmtDate(s),fim:fmtDate(addDays(s,6))}; }
    const y=cur.getFullYear(), m=cur.getMonth();
    return {inicio:fmtDate(new Date(y,m,1)),fim:fmtDate(new Date(y,m+1,0))};
  };

  const loadEventos = async () => {
    setLoading(true); setError("");
    const {inicio,fim} = getRange();
    try {
      const responses = await Promise.all(
        selectedConfigIds.map(async (configId) => {
          const { data } = await api.get(`/agenda/eventos/?config_id=${configId}&data_inicio=${inicio}&data_fim=${fim}`);
          const config = configs.find((item) => String(item.id) === String(configId));
          return (data.eventos || []).map((evento) => ({
            ...evento,
            _configId: configId,
            _configNome: config?.nome || data.config_nome || "Agenda",
            _uid: `${configId}:${evento.id}`,
          }));
        }),
      );
      setEventos(responses.flat());
    } catch(err) { setError(err?.response?.data?.detail||"Erro ao carregar eventos."); }
    finally { setLoading(false); }
  };

  const navigate = dir => {
    const d=new Date(cur);
    if (view==="day") d.setDate(d.getDate()+dir);
    else if (view==="week") d.setDate(d.getDate()+dir*7);
    else d.setMonth(d.getMonth()+dir);
    setCur(d);
  };

  const goToday = () => setCur(new Date(todayBase));

  const getTitle = () => {
    if (view==="day") return cur.toLocaleDateString("pt-BR",{day:"numeric",month:"long",year:"numeric"});
    if (view==="week") {
      const s=mondayOfWeek(cur), e=addDays(s,6);
      if (s.getMonth()===e.getMonth()) return `${MESES[s.getMonth()]} de ${s.getFullYear()}`;
      return `${MESES_CURTOS[s.getMonth()]} – ${MESES_CURTOS[e.getMonth()]} de ${e.getFullYear()}`;
    }
    return `${MESES[cur.getMonth()]} de ${cur.getFullYear()}`;
  };

  const openNewForm = () => {
    setEditingEvId(null);
    setForm({ ...emptyForm(), config_ids: selectedConfigIds.length ? selectedConfigIds.map(String) : (configs[0] ? [String(configs[0].id)] : []) });
    setNovoConvidado("");
    setShowForm(true);
  };

  const openEditForm = (ev) => {
    setSelectedEv(null);
    setEditingEvId(ev.id);
    const isAD = isAllDay(ev);
    const recurrenceData = parseEventRecurrence(ev);
    const sDate = ev.start?.date || (ev.start?.dateTime ? ev.start.dateTime.slice(0,10) : "");
    const eDate = ev.end?.date   || (ev.end?.dateTime   ? ev.end.dateTime.slice(0,10)   : "");
    const sTime = ev.start?.dateTime ? ev.start.dateTime.slice(11,16) : "09:00";
    const eTime = ev.end?.dateTime   ? ev.end.dateTime.slice(11,16)   : "10:00";
    setForm({
      titulo: ev.summary||"",
      data_inicio: sDate, data_fim: eDate,
      hora_inicio: sTime, hora_fim: eTime,
      descricao: ev.description||"",
      local: ev.location||"",
      dia_todo: isAD,
      com_meet: !!(ev.conferenceData),
      _meetUrl: ev.conferenceData?.entryPoints?.[0]?.uri || "",
      convidados: (ev.attendees||[]).map(a=>a.email).filter(Boolean),
      config_ids: ev._configId ? [String(ev._configId)] : [],
      repeticao: recurrenceData.repeticao,
      repetir_ate: recurrenceData.repetir_ate,
    });
    setNovoConvidado("");
    setShowForm(true);
  };

  const submitForm = e => {
    e.preventDefault();
    // Se tem convidados ou meet, confirma envio
    if (form.convidados.length > 0 || form.com_meet) {
      setPendingSave({...form});
      setShowConviteConfirm(true);
    } else {
      executeSave(form, false);
    }
  };

  const executeSave = async (payload, enviarConvites) => {
    setSaving(true); setError(""); setShowConviteConfirm(false);
    try {
      const targetConfigIds = Array.from(new Set((payload.config_ids || []).map((item) => Number(item)).filter(Boolean)));
      if (targetConfigIds.length === 0) {
        throw new Error("Selecione pelo menos uma agenda.");
      }
      const bodyBase = { ...payload, enviar_convites: enviarConvites };
      if (editingEvId) {
        await api.put("/agenda/eventos/", { ...bodyBase, config_id: targetConfigIds[0], event_id: editingEvId });
      } else {
        await Promise.all(
          targetConfigIds.map((configId) => api.post("/agenda/eventos/", { ...bodyBase, config_id: configId })),
        );
      }
      setShowForm(false);
      setForm(emptyForm());
      setEditingEvId(null);
      setPendingSave(null);
      setSuccessMsg(editingEvId ? "Evento atualizado!" : "Evento criado!");
      setTimeout(()=>setSuccessMsg(""),3000);
      loadEventos();
    } catch(err) { setError(err?.response?.data?.detail||err?.message||"Erro ao salvar evento."); }
    finally { setSaving(false); }
  };

  const toggleFormConfig = (configId) => {
    setForm((current) => {
      const key = String(configId);
      const currentIds = Array.isArray(current.config_ids) ? current.config_ids : [];
      return currentIds.includes(key)
        ? { ...current, config_ids: currentIds.filter((item) => item !== key) }
        : { ...current, config_ids: [...currentIds, key] };
    });
  };

  const adicionarConvidado = () => {
    const email = novoConvidado.trim();
    if (!email || form.convidados.includes(email)) return;
    setForm(f=>({...f, convidados:[...f.convidados, email]}));
    setNovoConvidado("");
  };

  const removerConvidado = email => {
    setForm(f=>({...f, convidados:f.convidados.filter(e=>e!==email)}));
  };

  const getEventDurationMinutes = (ev) => {
    const start = parseStart(ev);
    const end = parseEnd(ev) || start;
    if (!start || !end) return 60;
    return Math.max(30, Math.round((end.getTime() - start.getTime()) / 60000));
  };

  const buildDraggedEventPayload = (ev, startDate, endDate) => ({
    titulo: ev.summary || "(sem título)",
    data_inicio: fmtDate(startDate),
    data_fim: fmtDate(endDate),
    hora_inicio: minutesToTime(startDate.getHours()*60 + startDate.getMinutes()),
    hora_fim: minutesToTime(endDate.getHours()*60 + endDate.getMinutes()),
    descricao: ev.description || "",
    local: ev.location || "",
    dia_todo: false,
    com_meet: !!ev.conferenceData,
    convidados: (ev.attendees || []).map((a)=>a.email).filter(Boolean),
    repeticao: "",
    repetir_ate: "",
  });

  const saveDraggedEvent = async (dragged) => {
    const baseDay = new Date(dragged.day);
    baseDay.setHours(0,0,0,0);
    const startDate = new Date(baseDay);
    startDate.setMinutes(dragged.startMinutes);
    const endDate = new Date(startDate.getTime() + dragged.durationMinutes * 60000);
    const body = buildDraggedEventPayload(dragged.ev, startDate, endDate);

    setLoading(true);
    setError("");
    try {
      await api.put("/agenda/eventos/", { ...body, config_id: dragged.ev._configId, event_id: dragged.ev.id, enviar_convites: false });
      setSuccessMsg("Evento atualizado!");
      setTimeout(()=>setSuccessMsg(""),3000);
      await loadEventos();
    } catch (err) {
      setError(err?.response?.data?.detail || "Erro ao mover evento.");
    } finally {
      setLoading(false);
    }
  };

  const toggleConfigVisibility = (configId) => {
    setSelectedConfigIds((current) => {
      if (current.includes(configId)) {
        return current.filter((item) => item !== configId);
      }
      return [...current, configId];
    });
  };

  const startDragEvent = (ev, day, dayIndex, event) => {
    if (view!=="day" && view!=="week") return;
    if (isAllDay(ev)) return;
    const start = parseStart(ev);
    if (!start) return;
    const startMinutes = start.getHours()*60 + start.getMinutes();
    suppressClickRef.current = false;
    setDragState({
      ev,
      day: new Date(day),
      dayIndex,
      originalDayIndex: dayIndex,
      startMinutes,
      originalStartMinutes: startMinutes,
      durationMinutes: getEventDurationMinutes(ev),
      moved: false,
    });
    if (typeof event.currentTarget?.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
  };

  const hasActiveSearch = normalizeText(searchTerm).length > 0;
  const sidebarEvents = hasActiveSearch
    ? eventos.slice().sort(compareEvents)
    : selectedDay
      ? eventsForDay(eventos, selectedDay)
      : eventos.slice().sort(compareEvents);
  const filteredSidebarEvents = useMemo(() => {
    const normalizedSearch = normalizeText(searchTerm);
    return sidebarEvents.filter((ev) => {
      const haystack = buildEventSearchText(ev);
      if (normalizedSearch && !haystack.includes(normalizedSearch)) {
        return false;
      }
      return true;
    });
  }, [searchTerm, sidebarEvents]);
  const sidebarTitle = hasActiveSearch
    ? "Resultados da busca na agenda"
    : selectedDay
      ? `Atividades de ${fmtDateLong(selectedDay)}`
      : "Atividades da agenda";

  if (configs.length===0) return (
    <div style={{maxWidth:480,margin:"80px auto",textAlign:"center",color:"#5f6368"}}>
      <div style={{fontSize:52,marginBottom:16}}>📅</div>
      <h2 style={{fontWeight:400,color:"#3c4043"}}>Nenhuma agenda conectada</h2>
      <p>Configure em <a href="/agenda-config" style={{color:"#1a73e8"}}>Ferramentas → Agenda Google</a></p>
    </div>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",width:"100%",minWidth:0,flex:1,alignSelf:"stretch",fontFamily:"Arial,sans-serif",background:"#fff",overflow:"hidden"}}>

      {/* ── TOP BAR ── */}
      <div style={S.topBar}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button onClick={openNewForm} style={S.fab} title="Novo evento">+</button>
          <div style={{display:"flex",flexDirection:"column",gap:2}}>
            <span style={{fontSize:20,fontWeight:400,color:"#3c4043",letterSpacing:-.5}}>Agenda Google</span>
            <span style={{fontSize:12,color:"#5f6368"}}>Eventos salvos diretamente no Google Calendar</span>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={goToday} style={S.todayBtn}>Hoje</button>
          <button onClick={()=>navigate(-1)} style={S.arrowBtn}>&#8249;</button>
          <button onClick={()=>navigate(1)}  style={S.arrowBtn}>&#8250;</button>
          <span style={{fontSize:18,color:"#3c4043",minWidth:220}}>{getTitle()}</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={S.viewGroup}>
            {[["day","Dia"],["week","Semana"],["month","Mês"]].map(([v,label])=>(
              <button key={v} onClick={()=>setView(v)} style={{...S.viewBtn,...(view===v?S.viewBtnOn:{})}}>
                {label}
              </button>
            ))}
          </div>
          <a href="/agenda-config" style={{color:"#5f6368",fontSize:18,textDecoration:"none"}} title="Configurações">⚙</a>
        </div>
      </div>

      {successMsg && <div style={S.successBar}>{successMsg}</div>}
      {error && <div style={S.errorBar}>{error}</div>}
      {loading && <div style={{height:3,background:"#1a73e8"}} />}

      <div style={S.contentWrap}>
        <div style={S.calendarPanel}>
          {/* ── MONTH VIEW ── */}
          {view==="month" && (
            <MonthView
              cur={cur}
              today={todayBase}
              eventos={eventos}
              selectedDay={selectedDay}
              onDayClick={day=>setSelectedDay(new Date(day))}
              onEventClick={setSelectedEv}
            />
          )}

          {/* ── WEEK / DAY VIEW ── */}
          {(view==="week"||view==="day") && (
            <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
              {/* day headers */}
              <div style={{display:"flex",borderBottom:"1px solid #dadce0",flexShrink:0}}>
                <div style={{width:52,flexShrink:0}} />
                {weekDays.map((day,i)=>{
                  const isTod = sameDay(day,todayBase);
                  const isSelected = sameDay(day, selectedDay);
                  return (
                    <div
                      key={i}
                      style={{flex:1,textAlign:"center",padding:"6px 0",cursor:"pointer",userSelect:"none",background:isSelected?"#f1f3f4":"transparent"}}
                      onClick={()=>{
                        setCur(day);
                        setSelectedDay(new Date(day));
                        if (view==="week") setView("day");
                      }}
                    >
                      <div style={{fontSize:11,color:isTod?"#1a73e8":"#70757a",textTransform:"uppercase",letterSpacing:.8}}>
                        {DIAS_SEMANA_FULL[day.getDay()]}
                      </div>
                      <div style={{
                        fontSize:26,fontWeight:400,width:38,height:38,borderRadius:"50%",margin:"2px auto 0",
                        display:"flex",alignItems:"center",justifyContent:"center",
                        background:isTod?"#1a73e8":isSelected?"#e8f0fe":"transparent",
                        color:isTod?"#fff":isSelected?"#1a73e8":"#3c4043",
                      }}>{day.getDate()}</div>
                    </div>
                  );
                })}
              </div>
              {/* time grid */}
              <div ref={timeGridRef} style={{flex:1,overflowY:"auto",position:"relative"}}>
                <div style={{position:"relative",height:24*HOUR_HEIGHT}}>
                  {HOURS.map(h=>(
                    <div key={h} style={{position:"absolute",top:h*HOUR_HEIGHT,left:0,right:0,display:"flex",alignItems:"flex-start"}}>
                      <div style={{width:52,flexShrink:0,textAlign:"right",paddingRight:8,fontSize:10,color:"#70757a",marginTop:-6}}>{formatHourLabel(h)}</div>
                      <div style={{flex:1,borderTop:h===0?"none":"1px solid #dadce0"}} />
                    </div>
                  ))}
                  <div ref={timeGridBodyRef} style={{position:"absolute",top:0,left:52,right:0,bottom:0,display:"flex"}}>
                    {weekDays.map((day,di)=>{
                      const dayEvs = eventsForDay(eventos,day).filter(ev=>!isAllDay(ev));
                      return (
                        <div key={di} style={{flex:1,position:"relative",borderLeft:di>0?"1px solid #dadce0":"none"}}>
                          {dayEvs.map(ev=>{
                            const isDraggingThis = dragState?.ev?._uid===ev._uid;
                            if (isDraggingThis && dragState.dayIndex!==di) return null;
                            const pos = isDraggingThis
                              ? {
                                  top: dragState.startMinutes/60*HOUR_HEIGHT,
                                  height: Math.max((dragState.durationMinutes/60)*HOUR_HEIGHT,22),
                                }
                              : eventPosition(ev);
                            if(!pos) return null;
                            const c=evColor(ev);
                            return (
                              <div
                                key={ev._uid}
                                onClick={()=>{
                                  if (suppressClickRef.current) return;
                                  setSelectedEv(ev);
                                }}
                                onPointerDown={event=>startDragEvent(ev, day, di, event)}
                                style={{
                                position:"absolute",top:pos.top+1,height:pos.height-2,
                                left:2,right:2,background:c,borderRadius:4,
                                padding:"2px 5px",overflow:"hidden",
                                boxShadow:"0 1px 3px rgba(0,0,0,.2)",
                                touchAction:"none",
                                cursor:isDraggingThis?"grabbing":"grab",
                                opacity:isDraggingThis?0.92:1,
                                zIndex:isDraggingThis?5:1,
                              }}>
                                <div style={{fontSize:12,fontWeight:600,color:"#fff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                                  {ev.summary||"(sem título)"}
                                </div>
                                {pos.height>36&&ev.start?.dateTime&&(
                                  <div style={{fontSize:11,color:"rgba(255,255,255,.85)"}}>{fmtTime(ev.start.dateTime)}</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                  <CurrentTimeLine weekDays={weekDays} today={todayBase} />
                </div>
              </div>
            </div>
          )}
        </div>

        <AgendaSidebar
          configs={configs}
          selectedConfigIds={selectedConfigIds}
          onToggleConfig={toggleConfigVisibility}
          selectedDay={selectedDay}
          events={filteredSidebarEvents}
          onEdit={openEditForm}
          onEventClick={setSelectedEv}
          title={sidebarTitle}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
        />
      </div>

      {/* ── EVENT DETAIL POPUP ── */}
      {selectedEv && (
        <div style={S.overlay} onClick={()=>setSelectedEv(null)}>
          <div style={S.popup} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{width:12,height:12,borderRadius:2,background:evColor(selectedEv)}} />
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>openEditForm(selectedEv)} style={S.editBtn}>✏ Editar</button>
                <button onClick={()=>setSelectedEv(null)} style={S.closeBtn}>×</button>
              </div>
            </div>
            <div style={{fontSize:20,fontWeight:400,color:"#3c4043",marginBottom:12}}>{selectedEv.summary||"(sem título)"}</div>
            {!isAllDay(selectedEv) && selectedEv.start?.dateTime && (
              <div style={{fontSize:14,color:"#5f6368",marginBottom:8}}>
                🕐 {new Date(selectedEv.start.dateTime).toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"})},{" "}
                {fmtTime(selectedEv.start.dateTime)} – {fmtTime(selectedEv.end?.dateTime||selectedEv.start.dateTime)}
              </div>
            )}
            {isAllDay(selectedEv) && (
              <div style={{fontSize:14,color:"#5f6368",marginBottom:8}}>
                📅 {new Date(selectedEv.start.date+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"})} — Dia todo
              </div>
            )}
            {selectedEv.location && <div style={{fontSize:14,color:"#5f6368",marginBottom:8}}>📍 {selectedEv.location}</div>}
            {selectedEv.conferenceData?.entryPoints?.[0]?.uri && (
              <div style={{marginBottom:8,display:"flex",alignItems:"center",gap:8}}>
                <a href={selectedEv.conferenceData.entryPoints[0].uri} target="_blank" rel="noopener noreferrer"
                  style={{fontSize:14,color:"#1a73e8",display:"flex",alignItems:"center",gap:6,flex:1}}>
                  🎥 Entrar no Google Meet
                </a>
                <button
                  onClick={()=>{navigator.clipboard.writeText(selectedEv.conferenceData.entryPoints[0].uri);}}
                  title="Copiar link"
                  style={{border:"1px solid #dadce0",background:"#f8f9fa",borderRadius:4,padding:"3px 8px",fontSize:12,cursor:"pointer",color:"#3c4043"}}>
                  📋 Copiar
                </button>
              </div>
            )}
            {selectedEv.attendees?.length>0 && (
              <div style={{fontSize:13,color:"#5f6368",marginBottom:8}}>
                👥 {selectedEv.attendees.map(a=>a.email).join(", ")}
              </div>
            )}
            {selectedEv._configNome && (
              <div style={{fontSize:13,color:"#5f6368",marginBottom:8}}>
                Agenda: {selectedEv._configNome}
              </div>
            )}
            {getEventRecurrenceLabel(selectedEv) && (
              <div style={{fontSize:13,color:"#5f6368",marginBottom:8}}>
                {getEventRecurrenceLabel(selectedEv)}
              </div>
            )}
            {selectedEv.description && <div style={{fontSize:14,color:"#5f6368",whiteSpace:"pre-line",marginTop:8}}>{selectedEv.description}</div>}
          </div>
        </div>
      )}

      {/* ── FORM (criar / editar) ── */}
      {showForm && (
        <div style={S.overlay} onClick={()=>setShowForm(false)}>
          <div style={S.modal} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <span style={{fontSize:18,fontWeight:400,color:"#3c4043"}}>{editingEvId?"Editar evento":"Novo evento"}</span>
              <button onClick={()=>setShowForm(false)} style={S.closeBtn}>×</button>
            </div>
            <form onSubmit={submitForm}>
              <input style={S.titleInput} placeholder="Adicionar título" required
                value={form.titulo} onChange={e=>setForm(f=>({...f,titulo:e.target.value}))} />

              <label style={S.checkRow}>
                <input type="checkbox" checked={form.dia_todo} onChange={e=>setForm(f=>({...f,dia_todo:e.target.checked}))} />
                Dia todo
              </label>

              <div style={{marginBottom:12}}>
                <label style={S.lbl}>Agendas</label>
                <div style={S.formChecklist}>
                  {configs.map((config) => (
                    <label key={config.id} style={S.formCheckboxRow}>
                      <input
                        type="checkbox"
                        checked={(form.config_ids || []).includes(String(config.id))}
                        onChange={() => toggleFormConfig(config.id)}
                      />
                      <span>{config.nome}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* datas / horas */}
              <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
                <div style={{flex:1}}>
                  <label style={S.lbl}>Data início *</label>
                  <input style={S.inp} type="date" required value={form.data_inicio}
                    onChange={e=>{
                      const d=e.target.value;
                      setForm(f=>({...f, data_inicio:d, data_fim:f.data_fim||d}));
                    }} />
                </div>
                {!form.dia_todo&&(
                  <div style={{flex:1}}>
                    <label style={S.lbl}>Hora início</label>
                    <input style={S.inp} type="time" value={form.hora_inicio}
                      onChange={e=>{
                        const h=e.target.value;
                        setForm(f=>({...f, hora_inicio:h, hora_fim:addOneHour(h)}));
                      }} />
                  </div>
                )}
              </div>
              <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
                <div style={{flex:1}}>
                  <label style={S.lbl}>Data fim</label>
                  <input style={S.inp} type="date" value={form.data_fim}
                    onChange={e=>setForm(f=>({...f,data_fim:e.target.value}))} />
                </div>
                {!form.dia_todo&&(
                  <div style={{flex:1}}>
                    <label style={S.lbl}>Hora fim</label>
                    <input style={S.inp} type="time" value={form.hora_fim}
                      onChange={e=>setForm(f=>({...f,hora_fim:e.target.value}))} />
                  </div>
                )}
              </div>

              <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
                <div style={{flex:1}}>
                  <label style={S.lbl}>Repetição</label>
                  <select
                    style={S.inp}
                    value={form.repeticao}
                    onChange={e=>setForm(f=>({
                      ...f,
                      repeticao:e.target.value,
                      repetir_ate:e.target.value ? (f.repetir_ate || f.data_fim || f.data_inicio) : "",
                    }))}
                  >
                    <option value="">Não repetir</option>
                    <option value="weekly">Repetir semanalmente</option>
                    <option value="monthly">Repetir mensalmente</option>
                  </select>
                </div>
                {form.repeticao && (
                  <div style={{flex:1}}>
                    <label style={S.lbl}>Até a data</label>
                    <input
                      style={S.inp}
                      type="date"
                      required={Boolean(form.repeticao)}
                      value={form.repetir_ate}
                      onChange={e=>setForm(f=>({...f,repetir_ate:e.target.value}))}
                    />
                  </div>
                )}
              </div>

              {/* Google Meet */}
              <div style={{marginBottom:12}}>
                <label style={{...S.checkRow,marginBottom:4}}>
                  <input type="checkbox" checked={form.com_meet} onChange={e=>setForm(f=>({...f,com_meet:e.target.checked}))} />
                  <span style={{display:"flex",alignItems:"center",gap:5}}>🎥 Criar link do Google Meet</span>
                </label>
                {editingEvId && form._meetUrl && (
                  <div style={{display:"flex",alignItems:"center",gap:8,marginTop:4,padding:"6px 10px",background:"#f0f8ff",borderRadius:4,border:"1px solid #c6e0ff"}}>
                    <a href={form._meetUrl} target="_blank" rel="noopener noreferrer" style={{fontSize:13,color:"#1a73e8",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{form._meetUrl}</a>
                    <button type="button" onClick={()=>navigator.clipboard.writeText(form._meetUrl)}
                      style={{border:"1px solid #dadce0",background:"#fff",borderRadius:4,padding:"3px 8px",fontSize:12,cursor:"pointer",flexShrink:0}}>
                      📋 Copiar
                    </button>
                  </div>
                )}
              </div>

              {/* Local */}
              <div style={{marginBottom:12}}>
                <label style={S.lbl}>📍 Local</label>
                <input style={S.inp} placeholder="Adicionar local ou link" value={form.local}
                  onChange={e=>setForm(f=>({...f,local:e.target.value}))} />
              </div>

              {/* Convidados */}
              <div style={{marginBottom:12}}>
                <label style={S.lbl}>👥 Convidados</label>
                <div style={{display:"flex",gap:6}}>
                  <input style={{...S.inp,flex:1}} placeholder="email@exemplo.com" value={novoConvidado}
                    onChange={e=>setNovoConvidado(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();adicionarConvidado();}}} />
                  <button type="button" onClick={adicionarConvidado} style={S.addBtn}>+ Add</button>
                </div>
                {form.convidados.length>0&&(
                  <div style={{marginTop:6,display:"flex",flexWrap:"wrap",gap:4}}>
                    {form.convidados.map(email=>(
                      <span key={email} style={S.chip}>
                        {email}
                        <button type="button" onClick={()=>removerConvidado(email)} style={S.chipX}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Descrição */}
              <div style={{marginBottom:16}}>
                <label style={S.lbl}>Descrição</label>
                <textarea style={{...S.inp,minHeight:60,resize:"vertical"}} placeholder="Adicionar descrição"
                  value={form.descricao} onChange={e=>setForm(f=>({...f,descricao:e.target.value}))} />
              </div>

              {error&&showForm&&<div style={{color:"#c5221f",fontSize:13,marginBottom:10}}>{error}</div>}
              <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
                <button type="button" onClick={()=>setShowForm(false)} style={S.cancelBtn}>Cancelar</button>
                <button type="submit" style={S.saveBtn} disabled={saving}>{saving?"Salvando...":editingEvId?"Atualizar":"Salvar"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── CONFIRMAÇÃO DE CONVITE ── */}
      {showConviteConfirm && pendingSave && (
        <div style={S.overlay} onClick={()=>setShowConviteConfirm(false)}>
          <div style={{...S.popup,maxWidth:400}} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:"0 0 12px",fontWeight:400,fontSize:17,color:"#3c4043"}}>Enviar convites?</h3>
            {pendingSave.com_meet&&<p style={{fontSize:14,color:"#5f6368",margin:"0 0 8px"}}>🎥 Um link do Google Meet será gerado.</p>}
            {pendingSave.convidados.length>0&&(
              <p style={{fontSize:14,color:"#5f6368",margin:"0 0 16px"}}>
                👥 Notificar por e-mail:<br/>
                <strong>{pendingSave.convidados.join(", ")}</strong>
              </p>
            )}
            <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
              <button onClick={()=>{setShowConviteConfirm(false);setPendingSave(null);}} style={S.cancelBtn}>Cancelar</button>
              <button onClick={()=>executeSave(pendingSave,false)} style={S.cancelBtn} disabled={saving}>Não enviar</button>
              <button onClick={()=>executeSave(pendingSave,true)}  style={S.saveBtn}   disabled={saving}>{saving?"Salvando...":"Enviar convites"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Current time indicator ──
function CurrentTimeLine({ weekDays, today }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t=setInterval(()=>setNow(new Date()),60000); return ()=>clearInterval(t); }, []);
  const idx = weekDays.findIndex(d=>sameDay(d,today));
  if (idx<0) return null;
  const top = (now.getHours()+now.getMinutes()/60)*HOUR_HEIGHT;
  const colPct = 100/weekDays.length;
  return (
    <div style={{position:"absolute",top,left:`${idx*colPct}%`,width:`${colPct}%`,display:"flex",alignItems:"center",zIndex:3,pointerEvents:"none"}}>
      <div style={{width:10,height:10,borderRadius:"50%",background:"#ea4335",flexShrink:0}} />
      <div style={{flex:1,height:2,background:"#ea4335"}} />
    </div>
  );
}

// ── Month View ──
function MonthView({ cur, today, eventos, selectedDay, onDayClick, onEventClick }) {
  const y=cur.getFullYear(), m=cur.getMonth();
  const dim=getDaysInMonth(y,m), fdow=firstDowMonday(y,m);
  const cells=[]; for(let i=0;i<fdow;i++) cells.push(null); for(let d=1;d<=dim;d++) cells.push(d);
  while(cells.length%7!==0) cells.push(null);
  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",borderBottom:"1px solid #dadce0",flexShrink:0}}>
        {DIAS_SEMANA.map(d=>(
          <div key={d} style={{textAlign:"center",padding:"8px 0",fontSize:11,fontWeight:500,color:"#70757a",textTransform:"uppercase",letterSpacing:.8}}>{d}</div>
        ))}
      </div>
      <div style={{flex:1,display:"grid",gridTemplateColumns:"repeat(7,1fr)",gridTemplateRows:`repeat(${cells.length/7},1fr)`,overflow:"hidden"}}>
        {cells.map((day,i)=>{
          if(!day) return <div key={`e${i}`} style={{borderRight:"1px solid #dadce0",borderBottom:"1px solid #dadce0",background:"#fafafa"}} />;
          const cellDate=new Date(y,m,day);
          const isTod=sameDay(cellDate,today);
          const isSelected = sameDay(cellDate, selectedDay);
          const dow=cellDate.getDay();
          const isWknd=dow===0||dow===6;
          const dayEvs=eventsForDay(eventos,cellDate);
          const MAX=3, extra=dayEvs.length-MAX;
          return (
            <div key={day} onClick={()=>onDayClick(cellDate)} style={{
              borderRight:"1px solid #dadce0",borderBottom:"1px solid #dadce0",
              padding:"4px 4px 2px",overflow:"hidden",cursor:"pointer",
              background:isSelected?"#f8fbff":isWknd?"#fafafa":"#fff",minHeight:80,
            }}>
              <div style={{display:"flex",justifyContent:"center",marginBottom:2}}>
                <div style={{
                  width:26,height:26,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:13,fontWeight:isTod||isSelected?700:400,
                  color:isTod?"#fff":isSelected?"#1a73e8":isWknd?"#70757a":"#3c4043",
                  background:isTod?"#1a73e8":isSelected?"#e8f0fe":"transparent",
                }}>{day}</div>
              </div>
              {dayEvs.slice(0,MAX).map(ev=>{
                const allD=isAllDay(ev); const c=evColor(ev);
                return (
                  <div key={ev.id} onClick={e=>{e.stopPropagation();onEventClick(ev);}} style={{
                    background:allD?c:"transparent",borderRadius:3,
                    padding:"1px 4px",fontSize:11,fontWeight:500,
                    color:allD?"#fff":"#3c4043",
                    whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",
                    marginBottom:1,cursor:"pointer",display:"flex",alignItems:"center",gap:3,
                  }}>
                    {!allD&&<span style={{width:8,height:8,borderRadius:"50%",background:c,flexShrink:0,display:"inline-block"}} />}
                    {!allD&&ev.start?.dateTime&&<span style={{color:"#70757a",fontSize:10}}>{fmtTime(ev.start.dateTime)}</span>}
                    {ev.summary||"(sem título)"}
                  </div>
                );
              })}
              {extra>0&&<div style={{fontSize:11,color:"#1a73e8",paddingLeft:4}}>{extra} mais</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AgendaSidebar({
  configs,
  selectedConfigIds,
  onToggleConfig,
  title,
  selectedDay,
  events,
  onEdit,
  onEventClick,
  searchTerm,
  onSearchTermChange,
}) {
  return (
    <aside style={S.sidebar}>
      <div style={S.sidebarHeader}>
        <div style={S.sidebarCalendarSection}>
          <div style={S.sidebarSectionHeader}>
            <span style={S.sidebarSectionTitle}>Minhas agendas</span>
            <span style={S.sidebarSectionMeta}>{selectedConfigIds.length}/{configs.length}</span>
          </div>
          <div style={S.sidebarCalendarList}>
            {configs.map((config) => (
              <label
                key={config.id}
                style={{
                  ...S.sidebarCalendarItem,
                  ...(selectedConfigIds.includes(config.id) ? S.sidebarCalendarItemActive : {}),
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedConfigIds.includes(config.id)}
                  onChange={() => onToggleConfig(config.id)}
                />
                <span style={S.sidebarCalendarName}>{config.nome}</span>
              </label>
            ))}
          </div>
        </div>
        <div style={{fontSize:16,fontWeight:600,color:"#202124"}}>{title}</div>
        {selectedDay && <div style={{fontSize:12,color:"#5f6368"}}>Selecione outro dia no calendario para filtrar.</div>}
        <div style={S.sidebarFilters}>
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            placeholder="Buscar atividade, local ou convidado"
            style={S.sidebarSearchInput}
          />
        </div>
      </div>
      <div style={S.sidebarBody}>
        {events.length===0 ? (
          <div style={S.emptySidebar}>Nenhuma atividade encontrada com os filtros atuais.</div>
        ) : (
          events.map(ev=>(
            <div key={ev._uid} style={S.sidebarCard}>
              <button type="button" onClick={()=>onEventClick(ev)} style={S.sidebarEventBtn}>
                <span style={{...S.sidebarDot,background:evColor(ev)}} />
                <span style={{display:"flex",flexDirection:"column",gap:4,flex:1,minWidth:0}}>
                  <span style={{fontSize:14,fontWeight:600,color:"#202124",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                    {ev.summary || "(sem título)"}
                  </span>
                  <span style={{fontSize:12,color:"#5f6368"}}>{getEventDateLabel(ev)}</span>
                  {ev._configNome && <span style={{fontSize:12,color:"#5f6368"}}>{ev._configNome}</span>}
                  {ev.location && <span style={{fontSize:12,color:"#5f6368",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{ev.location}</span>}
                </span>
              </button>
              <button type="button" onClick={()=>onEdit(ev)} style={S.sidebarEditBtn}>Editar</button>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

// ── Styles ──
const S = {
  topBar:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 16px",borderBottom:"1px solid #dadce0",flexShrink:0,flexWrap:"wrap",gap:8},
  contentWrap:{flex:1,display:"flex",width:"100%",minWidth:0,overflow:"hidden"},
  calendarPanel:{flex:"1 1 auto",minWidth:0,display:"flex",flexDirection:"column",overflow:"hidden"},
  sidebar:{width:"clamp(300px, 25vw, 360px)",flexShrink:0,borderLeft:"1px solid #dadce0",background:"#fff",display:"flex",flexDirection:"column",minWidth:280},
  sidebarHeader:{padding:"14px 16px 12px",borderBottom:"1px solid #dadce0",display:"flex",flexDirection:"column",gap:10},
  sidebarCalendarSection:{display:"flex",flexDirection:"column",gap:8,paddingBottom:10,borderBottom:"1px solid #eef0f1"},
  sidebarSectionHeader:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8},
  sidebarSectionTitle:{fontSize:12,fontWeight:700,color:"#5f6368",textTransform:"uppercase",letterSpacing:".04em"},
  sidebarSectionMeta:{fontSize:12,color:"#5f6368"},
  sidebarCalendarList:{display:"flex",flexDirection:"column",gap:2},
  sidebarCalendarItem:{display:"flex",alignItems:"center",gap:10,padding:"6px 8px",borderRadius:8,fontSize:13,color:"#202124",cursor:"pointer"},
  sidebarCalendarItemActive:{background:"#e8f0fe",color:"#174ea6"},
  sidebarCalendarName:{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"},
  sidebarFilters:{display:"flex",flexDirection:"column",gap:8,marginTop:10},
  sidebarSearchInput:{width:"100%",border:"1px solid #dadce0",borderRadius:24,padding:"10px 14px",fontSize:13,outline:"none",boxSizing:"border-box",background:"#fff",color:"#202124"},
  sidebarSelect:{width:"100%",border:"1px solid #dadce0",borderRadius:8,padding:"10px 12px",fontSize:13,outline:"none",boxSizing:"border-box",background:"#fff",color:"#202124"},
  sidebarBody:{flex:1,overflowY:"auto",padding:12,display:"flex",flexDirection:"column",gap:8,background:"#fafafb"},
  emptySidebar:{margin:"20px 8px",padding:"18px 16px",border:"1px dashed #dadce0",borderRadius:10,color:"#5f6368",fontSize:13,textAlign:"center",background:"#fff"},
  sidebarCard:{background:"#fff",border:"1px solid #e0e3e7",borderRadius:12,padding:"10px 12px",display:"flex",alignItems:"flex-start",gap:12,boxShadow:"0 1px 2px rgba(60,64,67,.08)"},
  sidebarEventBtn:{flex:1,minWidth:0,border:"none",background:"transparent",padding:0,cursor:"pointer",display:"flex",alignItems:"flex-start",gap:10,textAlign:"left"},
  sidebarDot:{width:10,height:10,borderRadius:"50%",marginTop:4,flexShrink:0},
  sidebarEditBtn:{border:"1px solid #dadce0",background:"#fff",color:"#1a73e8",padding:"6px 10px",borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:600,flexShrink:0},
  fab:{width:40,height:40,borderRadius:"50%",border:"none",background:"#1a73e8",color:"#fff",fontSize:24,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 2px 6px rgba(26,115,232,.4)",lineHeight:1},
  todayBtn:{border:"1px solid #dadce0",borderRadius:4,background:"#fff",padding:"6px 14px",fontSize:14,cursor:"pointer",color:"#3c4043"},
  arrowBtn:{border:"none",background:"transparent",fontSize:22,cursor:"pointer",color:"#5f6368",padding:"4px 6px"},
  viewGroup:{display:"flex",border:"1px solid #dadce0",borderRadius:4,overflow:"hidden"},
  viewBtn:{border:"none",borderRight:"1px solid #dadce0",padding:"6px 14px",fontSize:13,cursor:"pointer",background:"#fff",color:"#3c4043"},
  viewBtnOn:{background:"#e8f0fe",color:"#1a73e8",fontWeight:600},
  sel:{border:"1px solid #dadce0",borderRadius:4,padding:"6px 10px",fontSize:13,background:"#fff",color:"#3c4043"},
  successBar:{background:"#e6f4ea",color:"#137333",padding:"7px 16px",fontSize:13},
  errorBar:{background:"#fce8e6",color:"#c5221f",padding:"7px 16px",fontSize:13},
  overlay:{position:"fixed",inset:0,background:"rgba(17,24,39,.48)",backdropFilter:"blur(4px)",WebkitBackdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16},
  modal:{background:"#fff",borderRadius:8,padding:24,width:"min(800px, calc(100vw - 32px))",minWidth:"min(350px, calc(100vw - 32px))",height:"95vh",maxHeight:"95vh",overflowY:"auto",boxShadow:"0 8px 28px rgba(0,0,0,.2)"},
  popup:{background:"#fff",borderRadius:8,padding:24,width:"100%",maxWidth:360,boxShadow:"0 8px 28px rgba(0,0,0,.2)"},
  closeBtn:{background:"transparent",border:"none",fontSize:22,cursor:"pointer",color:"#5f6368",padding:"0 4px"},
  titleInput:{width:"100%",border:"none",borderBottom:"2px solid #1a73e8",fontSize:22,fontWeight:300,color:"#3c4043",outline:"none",padding:"4px 0",marginBottom:20,boxSizing:"border-box"},
  checkRow:{display:"flex",alignItems:"center",gap:8,fontSize:14,color:"#5f6368",cursor:"pointer",marginBottom:16},
  lbl:{fontSize:12,color:"#5f6368",display:"block",marginBottom:4},
  inp:{width:"100%",border:"1px solid #dadce0",borderRadius:4,padding:"8px 10px",fontSize:14,outline:"none",boxSizing:"border-box",color:"#3c4043"},
  formChecklist:{display:"flex",flexDirection:"column",gap:8,padding:"10px 12px",border:"1px solid #dadce0",borderRadius:8,background:"#fff"},
  formCheckboxRow:{display:"flex",alignItems:"center",gap:8,fontSize:14,color:"#3c4043"},
  cancelBtn:{border:"none",background:"transparent",color:"#1a73e8",padding:"8px 16px",borderRadius:4,cursor:"pointer",fontSize:14},
  saveBtn:{border:"none",background:"#1a73e8",color:"#fff",padding:"8px 24px",borderRadius:4,cursor:"pointer",fontSize:14,fontWeight:600},
  editBtn:{border:"1px solid #dadce0",background:"#fff",color:"#3c4043",padding:"5px 12px",borderRadius:4,cursor:"pointer",fontSize:13},
  addBtn:{border:"1px solid #dadce0",background:"#f8f9fa",color:"#3c4043",padding:"8px 12px",borderRadius:4,cursor:"pointer",fontSize:13,whiteSpace:"nowrap"},
  chip:{background:"#e8f0fe",color:"#1a73e8",borderRadius:12,padding:"3px 8px 3px 10px",fontSize:12,display:"flex",alignItems:"center",gap:4},
  chipX:{background:"transparent",border:"none",color:"#1a73e8",cursor:"pointer",fontSize:14,padding:0,lineHeight:1},
};
