import path from 'path'
import Mastodon from 'mastodon-api'
import axios from 'axios'
import moment from 'moment'
import { shuffle } from 'lodash'
import DomainFilter, { IFilterConfig } from './DomainFilter'
import dotenv from 'dotenv'
dotenv.config({
    path: path.join(__dirname, '../.env'),
})


class MastodonApi {

    public M;
    public searchM;
    public instanceDomain = 'botsin.space'
    public botAccount;

    constructor() {

        this.M = new Mastodon({
            access_token: process.env.MASTODON_API_TOKEN,
            api_url: `https://${this.instanceDomain}/api/v1/`,
            timeout_ms: 60 * 1000,
        })

        this.searchM = new Mastodon({
            access_token: process.env.MASTODON_API_TOKEN,
            api_url: `https://${this.instanceDomain}/api/v2/`,
            timeout_ms: 60 * 1000,
        })

        this.healthcheck()
            .then(async (isHealthy) => {
                if (isHealthy) {
                    console.info("Connected to Mastodon API")
                    await this.getTokenAccount()
                    console.info(`Bot Account ID: ${this.botAccount.id}`)
                    await this.setupListeners()
                }
            })

    }

    async healthcheck() {
        const res = await this.M.get('streaming/health')
        return res.data === "OK"
    }

    async getTokenAccount() {
        const res = await this.searchM.get('search', {
            q: `expired@${this.instanceDomain}`,
            resolve: true,
            limit: 5,
        })

        this.botAccount = res.data.accounts[0]
        return res.data.accounts[0]
    }

    async setupListeners() {
        const listener = await this.M.stream('streaming/public')
        listener.on('message', async msg => {
            if (msg.event === "update") {
                await this.processUpdateData(msg.data)
            }
        })
    }

    async processUpdateData(update: any) {
        const { id, content, account } = update
        console.log(`Post from ${account.acct} - ${content.length} characters`)
        const sanitizedContent = await this.sanitizeData(content)
        await this.processData(sanitizedContent, { id, account})
    }

    async getMention(id: string | number) {
        const res = await this.M.get(`statuses/${id}`)
        return res
    }

    async postReply(status: string, id: string | number) {
        this.M.post('statuses', {
            status,
            in_reply_to_id: id,
            visibility: 'unlisted',
        })
            .then(res => console.log(`Reply posted: ${res.data.id}`))
            .catch(err => console.error(err))
    }

    async sanitizeData(content: string) {
        const sanitizedContent = content
            .replace(/<[^>]*>?/gm, '')
            .replace(/@[^ ]* /gm, '')
            .replace(/https?:\/\/[^ ]*/gm, '')
            .trim()

        return sanitizedContent
    }

    async processData(content: string, data: any) {
        if (content.match(/#dropfilter/gmi)) {
            await this.processPostContent(content, data)
        }
    }

    async processPostContent(content: string, data: any) {
        const keywords: string[] = content
            .replace(/#[a-zA-Z0-9]+/gm, '')
            .split(/\s+/gm)
            .map(kw => kw.toLowerCase())
            .filter(Boolean)

        console.log(`Number Of Keywords: ${keywords.length}`)

            console.log(`Keywords: ${keywords.join(', ')}`)

            const dedupedKeywords = keywords.filter((keyword, index) => {
                return keywords.indexOf(keyword) === index
            })

            if (dedupedKeywords.length) {

                const selectedKeywords = dedupedKeywords.slice(0, 5)

                let filterConfig: IFilterConfig = {
                    domainLength: [1, 12],
                    excludeHyphens: true,
                    excludeNumbers: true,
                    includeHacks: false,
                    extensions: [],
                    keywords: selectedKeywords,
                }

                const tomorrow = moment().add(1, 'days')

                const dropDate = tomorrow.format("M-DD-YYYY")

                const [m, d, y] = dropDate.split('-')

                const externalUrl = `https://archive.dropfilter.app/?y=${y}&m=${m}&d=${d}&bs=namejet`

                const res = await axios({
                    method: 'POST',
                    url: 'https:/dropfilter.app/api/filter',
                    data: {
                        config: filterConfig,
                        service: "namejet",
                        filename: `${dropDate}.txt`,
                    }
                })

                const { id, account } = data

                if (res.status === 200) {
                    const { count, domains } = res.data
                    console.log(`Found ${count} domains`)

                    const postStr = `@${account.acct} 
Here are some domains that are expiring tomorrow that match your keywords:

${domains.length && shuffle(domains).slice(0, 5).join('\n')}

Keyword List: ${selectedKeywords.join(', ')}

View the full, unfiltered list at
${externalUrl}
`
                    await this.postReply(postStr, id)
                }
            }
    }
}

export default MastodonApi