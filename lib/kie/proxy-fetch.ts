export async function kieFetch(
  input: string | URL | Request,
  init: RequestInit = {}
): Promise<Response> {
  return fetch(input, init);
}
