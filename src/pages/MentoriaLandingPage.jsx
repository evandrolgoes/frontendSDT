import { useEffect, useMemo, useState } from "react";

import {
  MENTORIA_LANDING_IMAGES,
  MENTORIA_LANDING_METRICS,
  MENTORIA_LANDING_MODULES,
  MENTORIA_LANDING_PERSONAS,
} from "../constants/mentoriaLanding";

const NAV_ITEMS = [
  { label: "Conceito", href: "#conceito" },
  { label: "Método", href: "#metodo" },
  { label: "SDT Position", href: "#software" },
  { label: "Mentor", href: "#mentor" },
];

const INITIAL_FORM = {
  nome: "",
  whatsapp: "",
  email: "",
  perfil: "",
  funcao: "",
  empresa: "",
  objetivo_mentoria: "",
};

function MentoriaSection({ children, className = "", id }) {
  return (
    <section id={id} className={`mentoria-landing-section ${className}`.trim()}>
      <div className="mentoria-landing-container">{children}</div>
    </section>
  );
}

function MentoriaEyebrow({ children }) {
  return <span className="mentoria-landing-eyebrow">{children}</span>;
}

export function MentoriaLandingPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const [formState, setFormState] = useState(INITIAL_FORM);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSlideIndex((current) => (current + 1) % MENTORIA_LANDING_IMAGES.sdtCarousel.length);
    }, 4000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isModalOpen) {
      setFormState(INITIAL_FORM);
      setIsSubmitted(false);
    }
  }, [isModalOpen]);

  const currentYear = useMemo(() => new Date().getFullYear(), []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormState((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      const response = await fetch("https://formspree.io/f/mnjjnbjk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formState),
      });

      if (response.ok) {
        setIsSubmitted(true);
      }
    } catch (error) {
      console.error("Erro ao enviar formulário da mentoria", error);
    }
  };

  return (
    <div className="mentoria-landing-page">
      {isModalOpen ? (
        <div className="mentoria-landing-modal-shell" role="dialog" aria-modal="true" aria-label="Aplicação Mentoria">
          <button className="mentoria-landing-modal-backdrop" aria-label="Fechar modal" onClick={() => setIsModalOpen(false)} />
          <div className="mentoria-landing-modal-card">
            <button className="mentoria-landing-modal-close" onClick={() => setIsModalOpen(false)} aria-label="Fechar">
              ×
            </button>

            {!isSubmitted ? (
              <>
                <MentoriaEyebrow>Processo Seletivo</MentoriaEyebrow>
                <h2 className="mentoria-landing-modal-title">Solicite acesso à mesa.</h2>
                <p className="mentoria-landing-modal-copy">Seus dados serão submetidos à análise estratégica.</p>

                <form className="mentoria-landing-form" onSubmit={handleSubmit}>
                  <label>
                    <span>Nome completo</span>
                    <input name="nome" type="text" value={formState.nome} onChange={handleChange} required />
                  </label>

                  <div className="mentoria-landing-form-grid">
                    <label>
                      <span>WhatsApp</span>
                      <input
                        name="whatsapp"
                        type="tel"
                        value={formState.whatsapp}
                        onChange={handleChange}
                        placeholder="(00) 00000-0000"
                        required
                      />
                    </label>
                    <label>
                      <span>E-mail</span>
                      <input name="email" type="email" value={formState.email} onChange={handleChange} required />
                    </label>
                  </div>

                  <label>
                    <span>Perfil</span>
                    <select name="perfil" value={formState.perfil} onChange={handleChange} required>
                      <option value="" disabled>
                        Selecione seu perfil
                      </option>
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
                    <select
                      name="objetivo_mentoria"
                      value={formState.objetivo_mentoria}
                      onChange={handleChange}
                      required
                    >
                      <option value="" disabled>
                        Selecione seu objetivo principal
                      </option>
                      <option value="Dominar proteção de margem (Hedge)">Dominar proteção de margem (Hedge)</option>
                      <option value="Transição de carreira para o mercado financeiro Agro">
                        Transição de carreira para o mercado financeiro Agro
                      </option>
                      <option value="Oferecer consultoria estratégica para clientes">
                        Oferecer consultoria estratégica para clientes
                      </option>
                      <option value="Entender formação de preços (Chicago/Câmbio)">
                        Entender formação de preços (Chicago/Câmbio)
                      </option>
                    </select>
                  </label>

                  <button type="submit" className="mentoria-landing-primary-btn">
                    Enviar aplicação
                  </button>
                </form>
              </>
            ) : (
              <div className="mentoria-landing-modal-success">
                <div className="mentoria-landing-modal-success-icon">✓</div>
                <h2>Aplicação em análise.</h2>
                <p>Em breve, nossa equipe entrará em contato via WhatsApp.</p>
                <button type="button" className="mentoria-landing-primary-btn" onClick={() => setIsModalOpen(false)}>
                  Voltar
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <nav className="mentoria-landing-nav">
        <div className="mentoria-landing-brand">
          TRADERS <span>do AGRO</span>
        </div>
        <div className="mentoria-landing-nav-links">
          {NAV_ITEMS.map((item) => (
            <a key={item.label} href={item.href}>
              {item.label}
            </a>
          ))}
        </div>
        <button type="button" className="mentoria-landing-nav-cta" onClick={() => setIsModalOpen(true)}>
          Aplicar
        </button>
      </nav>

      <header className="mentoria-landing-hero">
        <div className="mentoria-landing-hero-bg">
          <img src={MENTORIA_LANDING_IMAGES.heroFarm} alt="Safra" />
          <div className="mentoria-landing-hero-overlay" />
        </div>
        <div className="mentoria-landing-container mentoria-landing-hero-content">
          <MentoriaEyebrow>A profissão do futuro do agronegócio</MentoriaEyebrow>
          <h1 className="mentoria-landing-hero-title">
            Landing Page
            <br />
            <span>Mentoria</span>
          </h1>
          <p className="mentoria-landing-hero-text">
            Formamos estrategistas Agro que dominam Trading, Derivativos, Políticas de Hedge e Margem Financeira.
            Seja o profissional do Agro mais procurado dos próximos anos.
          </p>
          <div className="mentoria-landing-hero-actions">
            <button type="button" className="mentoria-landing-primary-btn" onClick={() => setIsModalOpen(true)}>
              Quero uma vaga
            </button>
            <span className="mentoria-landing-hero-tag">Apenas 50 vagas</span>
          </div>
        </div>
      </header>

      <MentoriaSection id="conceito" className="mentoria-landing-surface-gradient">
        <div className="mentoria-landing-copy-panel">
          <MentoriaEyebrow>Filosofia do Trader do Agro</MentoriaEyebrow>
          <h2 className="mentoria-landing-section-title">Produzir bem já não é mais um desafio para o produtor.</h2>
          <p className="mentoria-landing-section-highlight">
            Ele precisa de um estrategista confiável ao seu lado, alguém preparado para enfrentar os desafios do
            mercado.
          </p>
          <p className="mentoria-landing-body">
            O Trader do Agro nasce para ocupar esse lugar de confiança. Estrutura decisões, cria estratégias de venda,
            protege caixa, domina derivativos e aumenta a margem financeira da fazenda com método.
          </p>
        </div>
      </MentoriaSection>

      <MentoriaSection id="metodo" className="mentoria-landing-surface-dark">
        <div className="mentoria-landing-section-head">
          <MentoriaEyebrow>O que o trader aprende na mentoria</MentoriaEyebrow>
          <h2 className="mentoria-landing-section-title">14 níveis de domínio</h2>
        </div>
        <div className="mentoria-landing-card-grid">
          {MENTORIA_LANDING_MODULES.map((module) => (
            <article key={module.id} className="mentoria-landing-module-card">
              <div className="mentoria-landing-module-top">
                <span>{module.id}</span>
                <div />
              </div>
              <h3>{module.title}</h3>
              <p>{module.description}</p>
            </article>
          ))}
        </div>
      </MentoriaSection>

      <MentoriaSection id="software" className="mentoria-landing-surface-gradient">
        <div className="mentoria-landing-software-grid">
          <div className="mentoria-landing-copy-panel">
            <MentoriaEyebrow>O trader do agro tem acesso ao melhor sistema do Brasil</MentoriaEyebrow>
            <h2 className="mentoria-landing-section-title">
              SDT Position:
              <br />
              <span>o centro de comando</span> do estrategista.
            </h2>
            <p className="mentoria-landing-body">
              Tenha em mãos um sistema de gerenciamento de hedge que traduz a complexidade de Chicago para o lucro real
              na fazenda.
            </p>
            <div className="mentoria-landing-feature-list">
              <article>
                <strong>Política & Estratégia</strong>
                <p>Construa e acompanhe sua política de hedge com metas e travas visuais.</p>
              </article>
              <article>
                <strong>Gatilhos de Execução</strong>
                <p>Defina pontos exatos de entrada e saída para eliminar o viés emocional.</p>
              </article>
              <article>
                <strong>Ajuste MtM em Tempo Real</strong>
                <p>Visualize o mark-to-market em reais com total transparência sobre a posição.</p>
              </article>
            </div>
          </div>

          <div className="mentoria-landing-carousel-shell">
            <div className="mentoria-landing-carousel-card">
              <div className="mentoria-landing-carousel-bar">
                <span />
                <p>sdt_position_terminal v4.0</p>
                <div className="mentoria-landing-carousel-dots">
                  {MENTORIA_LANDING_IMAGES.sdtCarousel.map((image, index) => (
                    <button
                      key={image}
                      type="button"
                      className={index === slideIndex ? "is-active" : ""}
                      aria-label={`Ir para slide ${index + 1}`}
                      onClick={() => setSlideIndex(index)}
                    />
                  ))}
                </div>
              </div>
              <div className="mentoria-landing-carousel-viewport">
                {MENTORIA_LANDING_IMAGES.sdtCarousel.map((image, index) => (
                  <img
                    key={image}
                    src={image}
                    alt={`SDT Position ${index + 1}`}
                    className={index === slideIndex ? "is-visible" : ""}
                  />
                ))}
              </div>
            </div>
            <div className="mentoria-landing-floating-stat">
              <span>Ajustes positivos gerenciados</span>
              <strong>+ de R$ 8,0 milhões</strong>
            </div>
          </div>
        </div>
      </MentoriaSection>

      <MentoriaSection id="perfil" className="mentoria-landing-surface-dark">
        <div className="mentoria-landing-section-head">
          <MentoriaEyebrow>Para quem é a mentoria</MentoriaEyebrow>
          <h2 className="mentoria-landing-section-title">Perfis que aceleram resultado com inteligência financeira</h2>
        </div>
        <div className="mentoria-landing-persona-grid">
          {MENTORIA_LANDING_PERSONAS.map((persona) => (
            <article key={persona.role} className="mentoria-landing-persona-card">
              <h3>{persona.role}</h3>
              <p>{persona.context}</p>
            </article>
          ))}
        </div>
      </MentoriaSection>

      <MentoriaSection id="mentor" className="mentoria-landing-surface-gradient">
        <div className="mentoria-landing-mentor-grid">
          <div className="mentoria-landing-mentor-photo">
            <img src={MENTORIA_LANDING_IMAGES.mentorPortrait} alt="Evandro Góes" />
          </div>
          <div className="mentoria-landing-copy-panel">
            <MentoriaEyebrow>A liderança</MentoriaEyebrow>
            <h2 className="mentoria-landing-section-title">Evandro Góes</h2>
            <p className="mentoria-landing-body">
              Uma das maiores autoridades em hedge agrícola no Brasil. Atuou no Itaú BBA e na Louis Dreyfus Company,
              conectando a precisão dos mercados internacionais à realidade operacional da fazenda brasileira.
            </p>
            <p className="mentoria-landing-body">
              Mais do que teoria, executa mercado ao lado de produtores, estruturando decisões que protegem caixa,
              reduzem risco e aumentam resultado financeiro.
            </p>
            <div className="mentoria-landing-metric-grid">
              {MENTORIA_LANDING_METRICS.map((metric) => (
                <div key={metric.label} className="mentoria-landing-metric-card">
                  <strong>{metric.value}</strong>
                  <span>{metric.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </MentoriaSection>

      <MentoriaSection className="mentoria-landing-surface-cta">
        <div className="mentoria-landing-cta-panel">
          <MentoriaEyebrow>Compromisso estratégico</MentoriaEyebrow>
          <h2 className="mentoria-landing-section-title">
            O agronegócio <span>não perdoa amadores.</span>
          </h2>
          <p className="mentoria-landing-body">
            O tempo de contar com a sorte acabou. No novo ciclo das commodities, sobrevivência e prosperidade
            pertencem a quem domina a proteção do capital.
          </p>
          <button type="button" className="mentoria-landing-primary-btn" onClick={() => setIsModalOpen(true)}>
            Solicitar acesso à mentoria
          </button>
        </div>
      </MentoriaSection>

      <footer className="mentoria-landing-footer">
        <div className="mentoria-landing-footer-brand">Traders do Agro</div>
        <p>© {currentYear} - Landing Page Mentoria.</p>
      </footer>
    </div>
  );
}
