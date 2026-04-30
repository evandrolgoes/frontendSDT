import { useEffect, useMemo, useState } from "react";

import { api } from "../services/api";
import {
  MENTORIA_LANDING_IMAGES,
  MENTORIA_LANDING_METRICS,
  MENTORIA_LANDING_MODULES,
  MENTORIA_LANDING_PERSONAS,
} from "../constants/mentoriaLanding";

const NAV_ITEMS = [
  { label: "Conceito", href: "#conceito" },
  { label: "Método", href: "#metodo" },
  { label: "Hedge Position", href: "#software" },
  { label: "Mentor", href: "#mentor" },
];

const LANDING_PAGE_TITLE = "Traders do Agro - turma 02";
const WHATSAPP_CONTACT_NUMBER = "5542988113456";

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

const buildWhatsAppUrl = ({ nome, whatsapp, email, perfil, objetivo_mentoria, mensagem }) => {
  const message = [
    `Olá! Acabei de preencher o formulário da ${LANDING_PAGE_TITLE} e tenho interesse em uma vaga.`,
    "",
    `Nome: ${nome.trim()}`,
    `WhatsApp: ${whatsapp.trim()}`,
    `E-mail: ${email.trim()}`,
    `Perfil: ${perfil}`,
    `Objetivo: ${objetivo_mentoria}`,
    mensagem.trim() ? `Mensagem: ${mensagem.trim()}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `https://wa.me/${WHATSAPP_CONTACT_NUMBER}?text=${encodeURIComponent(message)}`;
};

const openWhatsAppConversation = (url) => {
  const popup = window.open(url, "_blank", "noopener,noreferrer");
  if (!popup) {
    window.location.assign(url);
  }
};

function MentoriaSection({ children, className = "", id }) {
  return (
    <section id={id} className={`mentoria-landing-section ${className}`.trim()}>
      <div className="mentoria-landing-container">{children}</div>
    </section>
  );
}

function MentoriaEyebrow({ children, className = "" }) {
  return <span className={`mentoria-landing-eyebrow ${className}`.trim()}>{children}</span>;
}

export function MentoriaLandingPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const [formState, setFormState] = useState(INITIAL_FORM);
  const [whatsAppUrl, setWhatsAppUrl] = useState("");

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSlideIndex((current) => (current + 1) % MENTORIA_LANDING_IMAGES.sdtCarousel.length);
    }, 4000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll(".mentoria-reveal"));
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
    if (!isModalOpen) {
      setFormState(INITIAL_FORM);
      setIsSubmitted(false);
      setIsSubmitting(false);
      setWhatsAppUrl("");
    }
  }, [isModalOpen]);

  useEffect(() => {
    document.title = LANDING_PAGE_TITLE;
  }, []);

  const currentYear = useMemo(() => new Date().getFullYear(), []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormState((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const { data } = await api.post("/leads/", {
        nome: formState.nome,
        whatsapp: formState.whatsapp,
        email: formState.email,
        perfil: formState.perfil,
        trabalho_ocupacao_atual: formState.funcao,
        empresa_atual: formState.empresa,
        landing_page: LANDING_PAGE_TITLE,
        objetivo: formState.objetivo_mentoria,
        mensagem: formState.mensagem,
      });

      if (data?.mail_warning) {
        console.warn("Lead salvo, mas o envio de e-mail falhou.");
      }

      const nextWhatsAppUrl = buildWhatsAppUrl(formState);
      setWhatsAppUrl(nextWhatsAppUrl);
      setIsSubmitted(true);
      openWhatsAppConversation(nextWhatsAppUrl);
    } catch (error) {
      console.error("Erro ao enviar formulário da mentoria", error);
    } finally {
      setIsSubmitting(false);
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
                <MentoriaEyebrow>PROGRAMA DE FORMACAO TRADERS DO AGRO</MentoriaEyebrow>
                <h2 className="mentoria-landing-modal-title">Solicitar mais Informações</h2>
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

                  <label>
                    <span>Mensagem</span>
                    <textarea
                      name="mensagem"
                      value={formState.mensagem}
                      onChange={handleChange}
                      rows="4"
                      placeholder="Conte um pouco sobre seu momento e o que busca na mentoria."
                    />
                  </label>

                  <button type="submit" className="mentoria-landing-primary-btn mentoria-landing-submit-btn" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <span className="mentoria-landing-submit-loader" aria-label="Enviando" />
                    ) : null}
                    {isSubmitting ? "Enviando..." : "Enviar Solicitação"}
                  </button>
                </form>
              </>
            ) : (
              <div className="mentoria-landing-modal-success">
                <div className="mentoria-landing-modal-success-icon">✓</div>
                <h2>Enviado!</h2>
                <p>Seu WhatsApp foi aberto para você falar conosco. Se não abrir automaticamente, use o botão abaixo.</p>
                <button
                  type="button"
                  className="mentoria-landing-primary-btn"
                  onClick={() => openWhatsAppConversation(whatsAppUrl)}
                >
                  Abrir WhatsApp
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
          QUERO UMA VAGA
        </button>
      </nav>

      <header className="mentoria-landing-hero">
        <div className="mentoria-landing-hero-bg">
          <img src={MENTORIA_LANDING_IMAGES.heroFarm} alt="Safra" />
          <div className="mentoria-landing-hero-overlay" />
        </div>
        <div className="mentoria-landing-container mentoria-landing-hero-content">
          <MentoriaEyebrow className="mentoria-landing-eyebrow-large mentoria-reveal">PROGRAMA DE FORMAÇÃO PROFISSIONAL</MentoriaEyebrow>
          <h1 className="mentoria-landing-hero-title mentoria-reveal mentoria-reveal-delay-1">
            Traders do Agro
            <br />
            <span>A maior Formação de Gestores de riscos e Mercado</span>
          </h1>
          <p className="mentoria-landing-hero-text mentoria-reveal mentoria-reveal-delay-2">
            Formamos estrategistas do Agro que dominam Derivativos, Trading, Mercado financeiro, Políticas de Hedge e
            Margem Financeira.
            <br />
            <span className="mentoria-landing-hero-text-emphasis">Para Profissionais</span>{" "}
            que desejam ocupar uma das cadeiras mais valiosas do Agro dos próximos anos.
            <br />
            <span className="mentoria-landing-hero-text-emphasis">Para Produtores</span> que necessitam decidir com
            estratégia e não com achismos.
          </p>
          <div className="mentoria-landing-hero-actions mentoria-reveal mentoria-reveal-delay-3">
            <button type="button" className="mentoria-landing-primary-btn" onClick={() => setIsModalOpen(true)}>
              Quero uma vaga
            </button>
            <span className="mentoria-landing-hero-tag">6 meses de acesso · Programa completo Estrategista de Hedge</span>
          </div>
        </div>
      </header>

      <MentoriaSection id="conceito" className="mentoria-landing-surface-gradient">
        <div className="mentoria-landing-copy-panel">
          <MentoriaEyebrow className="mentoria-landing-eyebrow-large mentoria-reveal">Filosofia do Trader do Agro</MentoriaEyebrow>
          <h2 className="mentoria-landing-section-title mentoria-reveal mentoria-reveal-delay-1">Produzir bem já não é mais um desafio para o produtor.</h2>
          <div className="mentoria-landing-conceito-copy mentoria-reveal mentoria-reveal-delay-2">
            <p className="mentoria-landing-section-highlight mentoria-landing-conceito-text">
              É comprovado que metade da margem financeira pode ser perdida por uma venda mal feita.
            </p>
            <p className="mentoria-landing-section-highlight mentoria-landing-conceito-text">
              E é por isso que o Produtor precisa de um estrategista confiável ao seu lado, alguém preparado para
              enfrentar os desafios do mercado com sabedoria e método.
            </p>
            <p className="mentoria-landing-section-highlight mentoria-landing-conceito-text">
              <span className="mentoria-landing-conceito-emphasis">O Trader do Agro</span> nasce para ocupar esse
              lugar de confiança. Estrutura decisões, cria estratégias de venda, protege caixa, domina derivativos e
              aumenta a margem financeira da fazenda com método.
            </p>
          </div>
        </div>
      </MentoriaSection>

      <MentoriaSection id="metodo" className="mentoria-landing-surface-dark">
        <div className="mentoria-landing-section-head">
          <MentoriaEyebrow className="mentoria-landing-eyebrow-large mentoria-reveal">O que o trader aprende na mentoria</MentoriaEyebrow>
          <h2 className="mentoria-landing-section-title mentoria-reveal mentoria-reveal-delay-1">14 níveis de domínio</h2>
        </div>
        <div className="mentoria-landing-card-grid">
          {MENTORIA_LANDING_MODULES.map((module) => (
            <article key={module.id} className="mentoria-landing-module-card mentoria-reveal mentoria-reveal-delay-2">
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
            <MentoriaEyebrow className="mentoria-landing-eyebrow-large mentoria-reveal">
              O trader do agro tem acesso ao melhor sistema do Brasil
            </MentoriaEyebrow>
            <h2 className="mentoria-landing-section-title mentoria-reveal mentoria-reveal-delay-1">
              Hedge Position:
              <br />
              <span>o centro de comando</span> do estrategista.
            </h2>
            <p className="mentoria-landing-body mentoria-reveal mentoria-reveal-delay-2">
              Tenha em mãos um sistema de gerenciamento de hedge que traduz a complexidade de Chicago para o lucro real
              na fazenda.
            </p>
            <div className="mentoria-landing-feature-list mentoria-reveal mentoria-reveal-delay-3">
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

          <div className="mentoria-landing-carousel-shell mentoria-reveal mentoria-reveal-right">
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
                    alt={`Hedge Position ${index + 1}`}
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
          <MentoriaEyebrow className="mentoria-landing-eyebrow-large mentoria-reveal">Para quem é a mentoria</MentoriaEyebrow>
          
        </div>
        <div className="mentoria-landing-persona-grid">
          {MENTORIA_LANDING_PERSONAS.map((persona) => (
            <article key={persona.role} className="mentoria-landing-persona-card mentoria-reveal mentoria-reveal-delay-1">
              <h3>{persona.role}</h3>
              <p>{persona.context}</p>
            </article>
          ))}
        </div>
      </MentoriaSection>

      <MentoriaSection id="mentor" className="mentoria-landing-surface-gradient">
        <div className="mentoria-landing-mentor-grid">
          <div className="mentoria-landing-mentor-photo mentoria-reveal mentoria-reveal-left">
            <img src={MENTORIA_LANDING_IMAGES.mentorPortrait} alt="Evandro Góes" />
          </div>
          <div className="mentoria-landing-copy-panel">
            <MentoriaEyebrow className="mentoria-reveal">A liderança</MentoriaEyebrow>
            <h2 className="mentoria-landing-section-title mentoria-reveal mentoria-reveal-delay-1">Evandro Góes</h2>
            <p className="mentoria-landing-body mentoria-reveal mentoria-reveal-delay-2">
              Uma das maiores autoridades em hedge agrícola no Brasil.
            </p>
            <p className="mentoria-landing-body mentoria-reveal mentoria-reveal-delay-2">
              + de 12 anos de experiência em Hedge aplicado ao Produtor rural.
              <br />
              Atuou por 5 anos no Itaú BBA e por outros 5 anos na Louis Dreyfus Company como Trader de Commodities
              Agrícolas.
            </p>
            <p className="mentoria-landing-body mentoria-reveal mentoria-reveal-delay-3">
              Construiu sua carreira unindo a precisão de mercados internacionais (como Chicago) à realidade
              operacional da fazenda brasileira.
            </p>
            <p className="mentoria-landing-body mentoria-reveal mentoria-reveal-delay-3">
              Mais do que teoria, atua na execução real de mercado, lado a lado com produtores, estruturando decisões
              que protegem caixa, reduzem risco e aumentam resultado financeiro.
            </p>
            <p className="mentoria-landing-body mentoria-reveal mentoria-reveal-delay-3">
              Criador de um método próprio e exclusivo, validado na prática, que gera em média 5% de ganho adicional
              de margem financeira para as fazendas atendidas.
            </p>
            <p className="mentoria-landing-body mentoria-reveal mentoria-reveal-delay-3">
              Evandro não forma analistas de mercado. Forma Trader estrategistas do produtor rural: profissionais
              preparados para tomar decisões financeiras em um dos mercados mais complexos do mundo.
            </p>
            <div className="mentoria-landing-metric-grid mentoria-reveal mentoria-reveal-delay-3">
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
        <div className="mentoria-landing-cta-panel mentoria-reveal">
          <MentoriaEyebrow>Compromisso estratégico</MentoriaEyebrow>
          <h2 className="mentoria-landing-section-title mentoria-reveal mentoria-reveal-delay-1">
            O agronegócio <span>não perdoa amadores.</span>
          </h2>
          <p className="mentoria-landing-body mentoria-reveal mentoria-reveal-delay-2">
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
