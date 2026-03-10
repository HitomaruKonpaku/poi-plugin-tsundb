export interface HandlerDetail {
  time: number
  method: string
  path: string
  body: any
  postBody?: any
}

export default interface Handler {
  handle(path: string, body: any, postBody: any, detail: HandlerDetail): void
  handleRequest?(path: string, body: any, postBody: any, detail: HandlerDetail): void
}
