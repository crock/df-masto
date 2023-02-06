import path from 'path'
import dotenv from 'dotenv'
dotenv.config({
    path: path.join(__dirname, '../.env'),
})

import MastodonApi from './MastodonApi'

new MastodonApi()

