import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { getSystemDocumentTitle } from "../routes/routes";

const PUBLIC_PAGE_TITLES = {
  "/landing/landing-page-mentoria": "Traders do Agro - turma 02",
  "/blog": "Hedge Position - Blog",
  "/login": "Hedge Position - Login",
  "/reset-password": "Hedge Position - Redefinir senha",
};

function getPublicDocumentTitle(pathname) {
  if (PUBLIC_PAGE_TITLES[pathname]) {
    return PUBLIC_PAGE_TITLES[pathname];
  }

  if (pathname.startsWith("/abrir-conta/")) {
    return "Hedge Position - Abrir conta";
  }

  if (pathname.startsWith("/blog/")) {
    return "Hedge Position - Blog";
  }

  return null;
}

export function DocumentTitleManager() {
  const location = useLocation();

  useEffect(() => {
    const publicTitle = getPublicDocumentTitle(location.pathname);
    document.title = publicTitle || getSystemDocumentTitle(location.pathname);
  }, [location.pathname]);

  return null;
}
