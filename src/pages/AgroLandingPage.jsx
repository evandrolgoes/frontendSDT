import {
  AGRO_LANDING_MODULES,
  AGRO_LANDING_NAV_ITEMS,
  AGRO_LANDING_PROFILE_ITEMS,
} from "../constants/agroLanding";
import {
  AgroLandingLabel,
  AgroLandingSubtitle,
  AgroLandingTitle,
} from "../components/AgroLandingTypography";

export function AgroLandingPage() {
  return (
    <div className="agro-landing-page">
      <nav className="agro-landing-nav">
        <div className="agro-landing-brand">
          Traders
          <span>do Agro</span>
        </div>
        <div className="agro-landing-nav-links">
          {AGRO_LANDING_NAV_ITEMS.map((item) => (
            <a key={item.label} href={item.href}>
              {item.label}
            </a>
          ))}
        </div>
        <a href="#inscricao" className="agro-landing-nav-cta">
          Candidatar-se
        </a>
      </nav>

      <section className="agro-landing-hero">
        <div className="agro-landing-hero-media">
          <img
            src="https://images.unsplash.com/photo-1594488311306-69678e7f1082?auto=format&fit=crop&q=80&w=2000"
            alt="Fundo Agro"
          />
          <div className="agro-landing-hero-overlay" />
        </div>
        <div className="agro-landing-container agro-landing-hero-content">
          <AgroLandingLabel className="agro-landing-block-label">A elite estratégica do agronegócio</AgroLandingLabel>
          <h1 className="agro-landing-hero-title">
            Sua margem é
            <br />
            nossa <span>estratégia</span>.
          </h1>
          <AgroLandingSubtitle className="agro-landing-hero-subtitle">
            Mentoria exclusiva para profissionais que buscam dominar o mercado físico, o gerenciamento de risco e a
            estruturação de hedge.
          </AgroLandingSubtitle>
          <div className="agro-landing-hero-actions">
            <a href="#inscricao" className="agro-landing-primary-btn">
              Iniciar Candidatura
            </a>
            <div className="agro-landing-vacancies">
              <span className="agro-landing-vacancies-line" />
              <span>Vagas Limitadas</span>
            </div>
          </div>
        </div>
      </section>

      <section id="conceito" className="agro-landing-section agro-landing-section-bordered">
        <div className="agro-landing-container agro-landing-two-columns">
          <div className="agro-landing-copy">
            <AgroLandingLabel>O Conceito</AgroLandingLabel>
            <AgroLandingTitle>
              Não venda commodities.
              <br />
              Venda estratégia.
            </AgroLandingTitle>
            <p className="agro-landing-body">
              O profissional que sobrevive ao mercado hoje é aquele que entende a dinâmica financeira por trás do
              campo. Nós entregamos a formação técnica para você se tornar o braço direito do produtor.
            </p>
            <div className="agro-landing-stats">
              <div>
                <h4>Hedge</h4>
                <p>Proteção Real</p>
              </div>
              <div>
                <h4>Network</h4>
                <p>Grupo Secreto</p>
              </div>
            </div>
          </div>
          <div className="agro-landing-image-frame">
            <img
              src="https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?auto=format&fit=crop&q=80&w=1200"
              alt="Agro Strategy"
            />
          </div>
        </div>
      </section>

      <section id="perfil" className="agro-landing-section">
        <div className="agro-landing-container">
          <div className="agro-landing-section-head centered">
            <AgroLandingLabel>Para Quem</AgroLandingLabel>
            <AgroLandingTitle>Feita para quem precisa decidir melhor sob pressão</AgroLandingTitle>
          </div>
          <div className="agro-landing-profile-grid">
            {AGRO_LANDING_PROFILE_ITEMS.map((item) => (
              <article key={item.title} className="agro-landing-profile-card">
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="programa" className="agro-landing-section agro-landing-program">
        <div className="agro-landing-container">
          <div className="agro-landing-section-head centered">
            <AgroLandingLabel>Formação 360º</AgroLandingLabel>
            <AgroLandingTitle>O Caminho do Trader</AgroLandingTitle>
          </div>
          <div className="agro-landing-module-grid">
            {AGRO_LANDING_MODULES.map((module) => (
              <article key={module.id} className="agro-landing-module-card">
                <span className="agro-landing-module-index">MÓDULO 0{module.id}</span>
                <h4>{module.title}</h4>
                <p>{module.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="mentor" className="agro-landing-section">
        <div className="agro-landing-container agro-landing-two-columns mentor">
          <div className="agro-landing-image-frame">
            <img
              src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=800"
              alt="Mentor"
            />
          </div>
          <div className="agro-landing-copy">
            <AgroLandingLabel>Mentor Principal</AgroLandingLabel>
            <AgroLandingTitle>Evandro Góes</AgroLandingTitle>
            <div className="agro-landing-quote">"O mercado não espera. A técnica te protege."</div>
            <p className="agro-landing-body">
              Com anos de experiência em grandes tradings e mesas de operação, Evandro Góes traz a realidade do campo
              para dentro da estratégia financeira. Sua mentoria é 100% prática e focada em resultados.
            </p>
            <div className="agro-landing-metrics">
              <div>
                <strong>+10 anos</strong>
                <span>Experiência</span>
              </div>
              <div>
                <strong>+1k Alunos</strong>
                <span>Formados</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="inscricao" className="agro-landing-cta-section">
        <div className="agro-landing-container agro-landing-cta-content">
          <AgroLandingLabel className="agro-landing-cta-label">Candidatura Aberta</AgroLandingLabel>
          <h2 className="agro-landing-cta-title">
            Pronto para se tornar
            <br />
            um <span>estrategista</span>?
          </h2>
          <p className="agro-landing-cta-text">
            Seja aceito em um grupo seleto de profissionais que estão mudando a forma como o Agro faz negócios.
          </p>
          <button className="agro-landing-primary-btn agro-landing-primary-btn-dark">Quero me Candidatar</button>
        </div>
      </section>

      <footer className="agro-landing-footer">
        <div className="agro-landing-footer-brand">Traders do Agro</div>
        <p>&copy; {new Date().getFullYear()} — Excelência em Mentoria Agro.</p>
      </footer>
    </div>
  );
}
