import { app } from './app'
import { env } from './env'

app.listen(env.port, () => {
  console.log(`Go Café API escuchando en http://localhost:${env.port}`)
})
