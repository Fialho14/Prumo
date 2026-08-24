export class FinanceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "FinanceError";
  }
}

export function toSafeError(error: unknown): { code: string; message: string; status: number } {
  if (error instanceof FinanceError) {
    return { code: error.code, message: error.message, status: error.status };
  }
  const systemCode = (error as NodeJS.ErrnoException | undefined)?.code ?? "";
  const message = error instanceof Error ? error.message : "";
  if (
    ["ENOENT", "ENOTDIR", "EACCES", "EPERM", "EROFS", "SQLITE_CANTOPEN", "SQLITE_IOERR", "SQLITE_READONLY"].includes(systemCode) ||
    /database (?:is )?(?:locked|readonly)|disk i\/o error|unable to open database/i.test(message)
  ) {
    return {
      code: "database_unavailable",
      message: "Base de dados privada não disponível. Certifica-te de que o volume está desbloqueado e montado.",
      status: 503,
    };
  }
  return {
    code: "unexpected_error",
    message: "Não foi possível concluir esta operação.",
    status: 500,
  };
}
