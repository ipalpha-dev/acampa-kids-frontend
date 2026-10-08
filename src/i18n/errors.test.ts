import { describe, expect, it } from "vitest";
import { ApiError } from "../api/client";
import { ERROR_TEXTS, errorText } from "./errors";
import { LITERALS } from "./literals";

describe("error texts — every error shown in the person's language", () => {
  it("pt-BR shows the server's own (pt-BR) message; technical ones become the gentle generic", () => {
    expect(errorText("pt", new ApiError(400, "TEAM_NOT_FOUND", "Time não encontrado."))).toBe("Time não encontrado.");
    expect(errorText("pt", new ApiError(500, "INTERNAL", "Erro interno."))).toBe("Algo deu errado. Tente novamente.");
  });

  it("other languages map by error code first", () => {
    expect(errorText("en", new ApiError(0, "OFFLINE", "Sem conexão com o servidor. Verifique o Wi-Fi do acampamento e tente novamente."))).toBe("No connection to the server. Check the camp Wi-Fi and try again.");
    expect(errorText("de", new ApiError(403, "CAMP_FORBIDDEN", "Você não tem acesso a este acampamento."))).toBe(LITERALS["Você não tem acesso a esse ano."]?.de);
    expect(errorText("es", new ApiError(423, "ACCOUNT_FROZEN", "Muitas tentativas incorretas. Tente novamente em 5 minuto(s).", { minutesLeft: 5 }))).toBe("Demasiados intentos incorrectos. Inténtalo de nuevo en 5 minuto(s).");
    expect(errorText("fr", new ApiError(409, "EDITION_MISSING", "Ainda não encontramos a edição 2027 no Oikos.", { year: 2027 }))).toBe("Nous n'avons pas encore trouvé l'édition 2027 dans Oikos. Demandez gentiment à la coordination du projet de la créer, puis réessayez.");
  });

  it("then a catalogued message, then the code's family, then the screen's fallback — never raw Portuguese", () => {
    expect(errorText("fr", new ApiError(404, "SOMETHING_ODD", "Algo deu errado."))).toBe(LITERALS["Algo deu errado."]?.fr);
    expect(errorText("en", new ApiError(404, "TEAM_NOT_FOUND", "Esse time não está mais aqui."))).toBe("We could not find what you were looking for. It may have been removed.");
    expect(errorText("en", new ApiError(400, "COLOR_INVALID", "Essa cor não serve."))).toBe("Something in the data isn't right. Check it and try again.");
    expect(errorText("en", new ApiError(409, "WEIRD", "Uma frase só em português."), "Não foi possível salvar.")).toBe(LITERALS["Não foi possível salvar."]?.en);
    expect(errorText("en", new ApiError(409, "WEIRD", "Uma frase só em português."))).toBe("Something went wrong. Try again.");
  });

  it("server refusal objects ({code, message}) read like errors; app errors pass through (already translated)", () => {
    expect(errorText("en", { code: "TOO_FAR", message: "Você está a 3 km da igreja." })).toBe("You are still far from the meeting point. Get closer to check in.");
    expect(errorText("en", new Error("Already in English."))).toBe("Already in English.");
    expect(errorText("en", "boom", "Algo deu errado.")).toBe(LITERALS["Algo deu errado."]?.en);
  });

  it("every text it may show exists in the four other languages", () => {
    const missing = ERROR_TEXTS.filter((pt) => {
      const row = LITERALS[pt];
      return !row?.en || !row.es || !row.fr || !row.de;
    });
    expect(missing).toEqual([]);
  });
});
