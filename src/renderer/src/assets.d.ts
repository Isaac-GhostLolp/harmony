// Vite turns imported images into URLs.
declare module '*.png' {
  const url: string
  export default url
}
