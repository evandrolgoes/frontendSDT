import { useEffect, useMemo, useRef, useCallback, useState } from "react";

import { api } from "../services/api";
import {
  MENTORIA_PLANS_DELIVERY,
  MENTORIA_PLANS_IMAGES,
  MENTORIA_PLANS_METRICS,
  MENTORIA_PLANS_PERSONAS,
  MENTORIA_PLANS,
} from "../constants/mentoriaPlansLanding";

const LANDING_PAGE_TITLE_PLANS = "Mentoria Traders do Agro — Plans";

const INITIAL_FORM = {
  nome: "",
  whatsapp: "",
  email: "",
  perfil: "",
  funcao: "",
  empresa: "",
  objetivo_mentoria: "",
  mensagem: "",
};



const LANDING_PAGE_TITLE = "Mentoria Traders do Agro";

function PlansSection({ children, className = "", id }) {
  return (
    <section id={id} className={`mentoria-plans-section ${className}`.trim()}>
      <div className="mentoria-plans-container">{children}</div>
    </section>
  );
}

function PlansEyebrow({ children, className = "" }) {
  return <span className={`mentoria-plans-eyebrow ${className}`.trim()}>{children}</span>;
}

export function MentoriaPlansLandingPage() {
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll(".mentoria-plans-reveal"));
    if (!elements.length) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" },
    );

    elements.forEach((element) => observer.observe(element));

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    document.title = LANDING_PAGE_TITLE;
  }, []);

  const currentYear = useMemo(() => new Date().getFullYear(), []);

  // ── Modal de lead ──
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState("");
  const [formState, setFormState] = useState(INITIAL_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openModal = useCallback((nivel, href) => {
    setFormState({ ...INITIAL_FORM, mensagem: `Tenho interesse no ${nivel}` });
    setPendingHref(href);
    setIsSubmitting(false);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => setModalOpen(false), []);

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.post("/leads/", {
        nome: formState.nome,
        whatsapp: formState.whatsapp,
        email: formState.email,
        perfil: formState.perfil,
        trabalho_ocupacao_atual: formState.funcao,
        empresa_atual: formState.empresa,
        landing_page: LANDING_PAGE_TITLE_PLANS,
        objetivo: formState.objetivo_mentoria,
        mensagem: formState.mensagem,
      });
    } catch (err) {
      console.error("Erro ao salvar lead", err);
    } finally {
      setIsSubmitting(false);
      // Redireciona direto para o checkout
      window.open(pendingHref, "_blank", "noopener,noreferrer");
      setModalOpen(false);
    }
  }, [formState, pendingHref]);

  // ── Carrossel drag + auto-scroll JS ──
  const wrapperRef = useRef(null);
  const trackRef = useRef(null);
  const drag = useRef({ active: false, hovering: false, startX: 0, scrollLeft: 0 });
  const rafRef = useRef(null);

  // Auto-scroll via rAF — 0.5px por frame (~30px/s a 60fps)
  useEffect(() => {
    const step = () => {
      const wrapper = wrapperRef.current;
      const track = trackRef.current;
      if (wrapper && track && !drag.current.active && !drag.current.hovering) {
        wrapper.scrollLeft += 0.5;
        // loop infinito: quando passa da metade do track, volta ao início
        if (wrapper.scrollLeft >= track.scrollWidth / 2) {
          wrapper.scrollLeft = 0;
        }
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const onMouseDown = useCallback((e) => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    drag.current.active = true;
    drag.current.startX = e.pageX - wrapper.offsetLeft;
    drag.current.scrollLeft = wrapper.scrollLeft;
    wrapper.style.cursor = "grabbing";
  }, []);

  const onMouseLeave = useCallback(() => {
    drag.current.active = false;
    drag.current.hovering = false;
    if (wrapperRef.current) wrapperRef.current.style.cursor = "grab";
  }, []);

  const onMouseUp = useCallback(() => {
    drag.current.active = false;
    if (wrapperRef.current) wrapperRef.current.style.cursor = "grab";
  }, []);

  const onMouseEnter = useCallback(() => {
    drag.current.hovering = true;
  }, []);

  const onMouseMove = useCallback((e) => {
    if (!drag.current.active) return;
    e.preventDefault();
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const x = e.pageX - wrapper.offsetLeft;
    const walk = (x - drag.current.startX) * 1.5;
    wrapper.scrollLeft = drag.current.scrollLeft - walk;
  }, []);

  // Touch support
  const onTouchStart = useCallback((e) => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    drag.current.active = true;
    drag.current.startX = e.touches[0].pageX - wrapper.offsetLeft;
    drag.current.scrollLeft = wrapper.scrollLeft;
  }, []);

  const onTouchEnd = useCallback(() => {
    drag.current.active = false;
  }, []);

  const onTouchMove = useCallback((e) => {
    if (!drag.current.active) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const x = e.touches[0].pageX - wrapper.offsetLeft;
    const walk = (x - drag.current.startX) * 1.5;
    wrapper.scrollLeft = drag.current.scrollLeft - walk;
  }, []);

  return (
    <div className="mentoria-plans-page">

      {/* ── MODAL DE LEAD ── */}
      {modalOpen ? (
        <div className="mentoria-landing-modal-shell" role="dialog" aria-modal="true" aria-label="Interesse na Mentoria">
          <button className="mentoria-landing-modal-backdrop" aria-label="Fechar" onClick={closeModal} />
          <div className="mentoria-landing-modal-card">
            <button className="mentoria-landing-modal-close" onClick={closeModal} aria-label="Fechar">×</button>

            <>
                <span className="mentoria-landing-eyebrow">PROGRAMA DE FORMAÇÃO TRADERS DO AGRO</span>
                <h2 className="mentoria-landing-modal-title">Preencha seus dados para continuar</h2>
                

                <form className="mentoria-landing-form" onSubmit={handleSubmit}>
                  <label>
                    <span>Nome completo</span>
                    <input name="nome" type="text" value={formState.nome} onChange={handleChange} required />
                  </label>
                  <div className="mentoria-landing-form-grid">
                    <label>
                      <span>WhatsApp</span>
                      <input name="whatsapp" type="tel" value={formState.whatsapp} onChange={handleChange} placeholder="(00) 00000-0000" required />
                    </label>
                    <label>
                      <span>E-mail</span>
                      <input name="email" type="email" value={formState.email} onChange={handleChange} required />
                    </label>
                  </div>
                  <label>
                    <span>Perfil</span>
                    <select name="perfil" value={formState.perfil} onChange={handleChange} required>
                      <option value="" disabled>Selecione seu perfil</option>
                      <option value="Produtor Rural">Produtor Rural</option>
                      <option value="Consultor / Agrônomo">Consultor / Agrônomo</option>
                      <option value="Profissional de Trading">Profissional de Trading / Originação</option>
                      <option value="Investidor">Investidor do Setor</option>
                      <option value="Outro">Outro</option>
                    </select>
                  </label>
                  <div className="mentoria-landing-form-grid">
                    <label>
                      <span>Trabalho e função atual</span>
                      <input name="funcao" type="text" value={formState.funcao} onChange={handleChange} required />
                    </label>
                    <label>
                      <span>Empresa atual</span>
                      <input name="empresa" type="text" value={formState.empresa} onChange={handleChange} required />
                    </label>
                  </div>
                  <label>
                    <span>Qual o objetivo com a mentoria?</span>
                    <select name="objetivo_mentoria" value={formState.objetivo_mentoria} onChange={handleChange} required>
                      <option value="" disabled>Selecione seu objetivo principal</option>
                      <option value="Dominar proteção de margem (Hedge)">Dominar proteção de margem (Hedge)</option>
                      <option value="Transição de carreira para o mercado financeiro Agro">Transição de carreira para o mercado financeiro Agro</option>
                      <option value="Oferecer consultoria estratégica para clientes">Oferecer consultoria estratégica para clientes</option>
                      <option value="Entender formação de preços (Chicago/Câmbio)">Entender formação de preços (Chicago/Câmbio)</option>
                    </select>
                  </label>
                  <label>
                    <span>Mensagem</span>
                    <textarea name="mensagem" value={formState.mensagem} onChange={handleChange} rows="3" />
                  </label>
                  <button type="submit" className="mentoria-landing-primary-btn mentoria-landing-submit-btn" disabled={isSubmitting}>
                    {isSubmitting ? <span className="mentoria-landing-submit-loader" aria-label="Enviando" /> : null}
                    {isSubmitting ? "Enviando..." : "Enviar e Continuar"}
                  </button>
                </form>
            </>
          </div>
        </div>
      ) : null}

      <nav className="mentoria-plans-nav">
        <div className="mentoria-plans-brand">
          TRADERS <span>do AGRO</span>
        </div>
        <a href="#planos" className="mentoria-plans-nav-cta">
          ESCOLHER MEU PLANO
        </a>
      </nav>

      {/* ── HERO ── */}
      <header className="mentoria-plans-hero">
        <div className="mentoria-plans-hero-bg">
          <img src={MENTORIA_PLANS_IMAGES.heroFarm} alt="Safra" />
          <div className="mentoria-plans-hero-overlay" />
        </div>
        <div className="mentoria-plans-container mentoria-plans-hero-content">
          <PlansEyebrow className="mentoria-plans-eyebrow-large mentoria-plans-reveal">A profissão mais valorizada do Agro dos próximos 10 anos</PlansEyebrow>
          <h1 className="mentoria-plans-hero-title mentoria-plans-reveal mentoria-plans-reveal-delay-1">
            Traders do Agro
            <br />
            <span>Torne-se um Estrategista de Hedge</span>
          </h1>
          <p className="mentoria-plans-hero-text mentoria-plans-reveal mentoria-plans-reveal-delay-2">
            O mercado do Agro não recompensa quem só produz bem. Ele recompensa quem{" "}
            <span className="mentoria-plans-hero-text-emphasis">domina a estratégia por trás do preço.</span>
            <br />
            Derivativos, gestão de risco, política de hedge, leitura de mercado e tomada de decisão com método —
            é isso que separa quem sobrevive de{" "}
            <span className="mentoria-plans-hero-text-emphasis">quem lidera o jogo.</span>
            <br /><br />
            <span className="mentoria-plans-hero-text-emphasis">Para Profissionais</span>{" "}
            que desejam ocupar uma das cadeiras mais valiosas do Agro dos próximos anos.
            <br />
            <span className="mentoria-plans-hero-text-emphasis">Para Produtores</span> que precisam decidir com
            estratégia e não com achismos.
          </p>
          <div className="mentoria-plans-hero-actions mentoria-plans-reveal mentoria-plans-reveal-delay-3">
            <a href="#planos" className="mentoria-plans-primary-btn">
              Quero ser Estrategista de Hedge
            </a>
            <span className="mentoria-plans-hero-tag">6 meses de acesso · Trader Agro ou Estrategista de Hedge</span>
          </div>
        </div>
      </header>

      {/* ── CONCEITO ── */}
      <PlansSection id="conceito" className="mentoria-plans-surface-gradient">
        <div className="mentoria-plans-conceito-grid">
          <div className="mentoria-plans-copy-panel">
            <PlansEyebrow className="mentoria-plans-eyebrow-large mentoria-plans-reveal">A profissão mais valorizada do Agro dos próximos 10 anos</PlansEyebrow>
            <h2 className="mentoria-plans-section-title mentoria-plans-reveal mentoria-plans-reveal-delay-1">
              Produzir bem já não garante margem. Decidir bem, sim.
            </h2>
            <div className="mentoria-plans-conceito-copy mentoria-plans-reveal mentoria-plans-reveal-delay-2">
              <p className="mentoria-plans-section-highlight mentoria-plans-conceito-text">
                É comprovado que metade da margem financeira pode ser destruída por uma venda mal posicionada —
                independente de quanto a safra rendeu.
              </p>
              <p className="mentoria-plans-section-highlight mentoria-plans-conceito-text">
                O <span className="mentoria-plans-conceito-emphasis">Estrategista de Hedge</span> é o profissional que
                ocupa o lugar mais valioso do Agro: ao lado de quem decide. Ele estrutura operações, monta políticas de
                risco, domina derivativos e protege o caixa da fazenda com precisão — não com intuição.
              </p>
              <p className="mentoria-plans-section-highlight mentoria-plans-conceito-text">
                Com o avanço do mercado de commodities e a crescente complexidade das operações no campo, essa é a
                profissão que o Agro mais vai demandar na próxima década.{" "}
                <span className="mentoria-plans-conceito-emphasis">Quem se preparar agora chegará na frente.</span>
              </p>
              <p className="mentoria-plans-section-highlight mentoria-plans-conceito-text">
                Você pode entrar pelo Trader Agro para dominar a base — ou ir direto para onde o jogo de verdade acontece:
                o nível Estrategista de Hedge.
              </p>
            </div>
          </div>
          <div className="mentoria-plans-conceito-image mentoria-plans-reveal mentoria-plans-reveal-right">
            <img src={MENTORIA_PLANS_IMAGES.conceitoField} alt="Campo de soja ao entardecer" />
            <div className="mentoria-plans-conceito-image-overlay">
              <span>"Metade da margem se perde na venda, não na produção."</span>
            </div>
          </div>
        </div>
      </PlansSection>

      {/* ── FORMATO DE ENTREGA ── */}
      <PlansSection id="metodo" className="mentoria-plans-surface-dark">
        <div className="mentoria-plans-section-head">
          <PlansEyebrow className="mentoria-plans-eyebrow-large mentoria-plans-reveal">Como funciona a mentoria</PlansEyebrow>
          <h2 className="mentoria-plans-section-title mentoria-plans-reveal mentoria-plans-reveal-delay-1">
            Estrutura de aprendizado
          </h2>
          <p className="mentoria-plans-body mentoria-plans-reveal mentoria-plans-reveal-delay-2">
            Conteúdo gravado, prática ao vivo e comunidade ativa — tudo pensado para quem precisa de resultado, não
            apenas de informação.
          </p>
        </div>
        <div
          className="mentoria-plans-delivery-carousel-wrapper"
          ref={wrapperRef}
          onMouseEnter={onMouseEnter}
          onMouseDown={onMouseDown}
          onMouseLeave={onMouseLeave}
          onMouseUp={onMouseUp}
          onMouseMove={onMouseMove}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onTouchMove={onTouchMove}
          style={{ cursor: "grab" }}
        >
          <div className="mentoria-plans-delivery-carousel-track" ref={trackRef}>
            {[...MENTORIA_PLANS_DELIVERY, ...MENTORIA_PLANS_DELIVERY].map((item, i) => (
              <article key={`${item.title}-${i}`} className="mentoria-plans-delivery-card">
                <div className="mentoria-plans-delivery-card-image">
                  <img src={MENTORIA_PLANS_IMAGES[item.imageKey]} alt={item.title} />
                </div>
                <div className="mentoria-plans-delivery-card-body">
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </PlansSection>

      {/* ── PARA QUEM É ── */}
      <PlansSection id="perfil" className="mentoria-plans-surface-gradient">
        <div className="mentoria-plans-section-head">
          <PlansEyebrow className="mentoria-plans-eyebrow-large mentoria-plans-reveal">Para quem é a mentoria</PlansEyebrow>
          <h2 className="mentoria-plans-section-title mentoria-plans-reveal mentoria-plans-reveal-delay-1">
            Para quem quer <span>estar no controle</span>
          </h2>
        </div>
        <div className="mentoria-plans-persona-grid">
          {MENTORIA_PLANS_PERSONAS.map((persona) => (
            <article key={persona.role} className="mentoria-plans-persona-card mentoria-plans-reveal mentoria-plans-reveal-delay-1">
              <h3>{persona.role}</h3>
              <p>{persona.context}</p>
            </article>
          ))}
        </div>
      </PlansSection>

      {/* ── FRASE FAIXA ── */}
      <div className="mentoria-plans-strip-quote-bar mentoria-plans-reveal">
        <p>
          "O mercado não precisa de opiniões.<br />
          <strong>Precisa de estrategistas."</strong>
        </p>
      </div>

      {/* ── PLANOS E PREÇOS ── */}
      <PlansSection id="planos" className="mentoria-plans-surface-gradient">
        <div className="mentoria-plans-section-head">
          <PlansEyebrow className="mentoria-plans-eyebrow-large mentoria-plans-reveal">Escolha seu nível de entrada</PlansEyebrow>
          <h2 className="mentoria-plans-section-title mentoria-plans-reveal mentoria-plans-reveal-delay-1">
            Os dois caminhos para se tornar um{" "}
            <span>Estrategista de Hedge</span>
          </h2>
          <p className="mentoria-plans-body mentoria-plans-reveal mentoria-plans-reveal-delay-2">
            Você pode começar pela base e construir a sua jornada — ou ir direto ao nível mais completo, onde estão
            as ferramentas, as estratégias e a visão de quem realmente joga o jogo do mercado.
            <br />
            6 meses de acesso · parcelamento em até 12x no cartão.
          </p>
        </div>

        <p className="mentoria-plans-choose-label mentoria-plans-reveal">Escolha o seu nível de acesso</p>

        {/* Card único por plano — conteúdo + preço + CTA */}
        <div className="mentoria-plans-combined-grid">
          {MENTORIA_PLANS.map((plan) => (
            <article
              key={plan.id}
              className={`mentoria-plans-combined-card mentoria-plans-reveal mentoria-plans-reveal-delay-1${plan.badge ? " mentoria-plans-combined-card--featured" : ""}`}
              style={{ "--plan-accent": plan.accentColor, "--plan-level-color": plan.levelColor }}
            >
              {plan.badge ? <div className="mentoria-plans-combined-badge">{plan.badge}</div> : null}

              {/* Cabeçalho */}
              <div className="mentoria-plans-combined-header">
                <div className="mentoria-plans-combined-numeral-wrap">
                  <span className="mentoria-plans-combined-level-word">{plan.levelWord}</span>
                  <div className="mentoria-plans-combined-numeral">{plan.romanNumeral}</div>
                </div>
                <div>
                  <div className="mentoria-plans-combined-level-prefix">{plan.levelPrefix}</div>
                  <div className="mentoria-plans-combined-level">{plan.level}</div>
                  <div className="mentoria-plans-combined-subtitle">{plan.subtitle}</div>
                </div>
              </div>

              {/* Promessa */}
              <p className="mentoria-plans-combined-promise">{plan.promise}</p>

              {/* Para quem serve */}
              <div className="mentoria-plans-combined-block">
                <span className="mentoria-plans-combined-label">Para quem é este nível</span>
                <ul className="mentoria-plans-combined-for-who-list">
                  {plan.forWho.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              {/* Conteúdos + Acesso — bloco unificado */}
              <div className="mentoria-plans-combined-block">
                <span className="mentoria-plans-combined-label">Conteúdos e o que você terá acesso</span>
                {plan.includesIntro ? (
                  <>
                    <div className="mentoria-plans-combined-all-included mentoria-plans-combined-all-included--topics">
                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <circle cx="7" cy="7" r="6.5" stroke="currentColor" strokeOpacity="0.5" />
                        <path d="M4 7l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Todo o conteúdo do Trader Junior
                    </div>
                    <div className="mentoria-plans-combined-plus mentoria-plans-combined-plus--left">+</div>
                  </>
                ) : null}
                <ul className="mentoria-plans-combined-topics">
                  {plan.topics.map((topic) => (
                    <li key={topic}>{topic}</li>
                  ))}
                </ul>

                <div className="mentoria-plans-combined-divider mentoria-plans-combined-divider--inner" />

                <ul className="mentoria-plans-combined-includes mentoria-plans-combined-includes--accent">
                  {plan.includes.map((item) => (
                    <li key={item}>
                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <circle cx="7" cy="7" r="6.5" stroke="currentColor" strokeOpacity="0.4" />
                        <path d="M4 7l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Preço + CTA */}
              <div className="mentoria-plans-combined-footer">
                <div className="mentoria-plans-promo-badge">VALOR PROMOCIONAL DE LANÇAMENTO</div>
                <div className="mentoria-plans-combined-price-row">
                  <div className="mentoria-plans-combined-price">
                    <div className="mentoria-plans-combined-price-from">
                      de <s>{plan.originalPrice}</s> para
                    </div>
                    <strong>{plan.priceInstallment}</strong>
                    <span>{plan.priceTotal}</span>
                  </div>
                  <button
                    type="button"
                    className="mentoria-plans-combined-cta"
                    onClick={() => openModal(`Nível ${plan.level}`, plan.ctaHref)}
                  >
                    {plan.ctaLabel}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </PlansSection>

      {/* ── MENTOR ── */}
      <PlansSection id="mentor" className="mentoria-plans-surface-dark">
        <div className="mentoria-plans-mentor-grid">
          <div className="mentoria-plans-mentor-photo mentoria-plans-reveal mentoria-plans-reveal-left">
            <img src={MENTORIA_PLANS_IMAGES.mentorPortrait} alt="Evandro Góes" />
          </div>
          <div className="mentoria-plans-copy-panel">
            <PlansEyebrow className="mentoria-plans-eyebrow-large mentoria-plans-reveal">Quem será o seu Mentor</PlansEyebrow>
            <h2 className="mentoria-plans-section-title mentoria-plans-reveal mentoria-plans-reveal-delay-1">Evandro Góes</h2>
            <p className="mentoria-plans-body mentoria-plans-reveal mentoria-plans-reveal-delay-2">
              Uma das maiores autoridades em hedge agrícola no Brasil — e o criador do método que a mentoria ensina.
            </p>
            <p className="mentoria-plans-body mentoria-plans-reveal mentoria-plans-reveal-delay-2">
              + de 12 anos operando hedge aplicado ao produtor rural. 5 anos no Itaú BBA e 5 anos na Louis Dreyfus
              Company como Trader de Commodities Agrícolas.
            </p>
            <p className="mentoria-plans-body mentoria-plans-reveal mentoria-plans-reveal-delay-3">
              Não é teoria. É o mesmo método que ele aplica hoje, ao lado de produtores reais, estruturando operações
              que protegem caixa, reduzem risco e aumentam a margem financeira da fazenda — em média 5% a mais por safra.
            </p>
            <p className="mentoria-plans-body mentoria-plans-reveal mentoria-plans-reveal-delay-3">
              Evandro não forma analistas. Forma{" "}
              <span className="mentoria-plans-conceito-emphasis">Estrategistas de Hedge</span> — profissionais preparados
              para ocupar a cadeira mais valiosa do Agro: a de quem decide com inteligência e protege quem produz.
            </p>
          </div>
        </div>
        <div className="mentoria-plans-metric-grid mentoria-plans-reveal mentoria-plans-reveal-delay-3">
          {MENTORIA_PLANS_METRICS.map((metric) => (
            <div key={metric.label} className="mentoria-plans-metric-card">
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </div>
          ))}
        </div>
      </PlansSection>

      {/* ── CTA FINAL ── */}
      <PlansSection className="mentoria-plans-surface-cta">
        <div className="mentoria-plans-cta-panel mentoria-plans-reveal">
          <PlansEyebrow>Chegou a hora de decidir</PlansEyebrow>
          <h2 className="mentoria-plans-section-title mentoria-plans-reveal mentoria-plans-reveal-delay-1">
            O que você está fazendo <span>com o seu tempo?</span>
          </h2>
          <p className="mentoria-plans-body mentoria-plans-reveal mentoria-plans-reveal-delay-2">
            Daqui a 6 meses, o tempo vai ter passado de qualquer jeito. A questão é: você vai estar no mesmo lugar —
            ou vai ter se tornado o profissional mais procurado do Agro?
            <br />
            <br />
            <strong>A janela está aberta. Quem entra agora sai na frente.</strong>
          </p>
          <a href="#planos" className="mentoria-plans-primary-btn">
            Quero ser Estrategista de Hedge
          </a>
        </div>
      </PlansSection>

      <footer className="mentoria-plans-footer">
        <div className="mentoria-plans-footer-brand">Traders do Agro</div>
        <p>© {currentYear} - Mentoria Traders do Agro.</p>
      </footer>
    </div>
  );
}
