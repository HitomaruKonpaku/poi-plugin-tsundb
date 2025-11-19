import { createHash } from 'crypto'
import { readJsonSync } from 'fs-extra'
import _ from 'lodash'
import fetch from 'node-fetch'
import { resolve } from 'path'
import Handler from './handler'

export class KCRDB implements Handler {
  private readonly BASE_URL = 'https://kcrdb.hitomaru.dev'
  // private readonly BASE_URL = 'http://localhost:8880'

  private readonly QUEST_HASH_FIELDS = [
    'api_no',
    'api_category',
    'api_type',
    'api_label_type',
    'api_title',
    'api_detail',
    'api_voice_id',
    'api_lost_badges',
    'api_get_material',
    'api_select_rewards',
    'api_bonus_flag',
    'api_state',
  ]

  private readonly appVersion: string
  private readonly pluginName: string
  private readonly pluginVersion: string

  private readonly questHashes = new Set()

  constructor() {
    const pkg = readJsonSync(resolve(__dirname, '../package.json'))
    this.appVersion = _.get(window, 'POI_VERSION', 'unknown')
    this.pluginName = pkg.name
    this.pluginVersion = pkg.version
  }

  public static hash(s: string, algorithm = 'sha256'): string {
    const res = createHash(algorithm).update(s).digest('hex')
    return res
  }

  public handle(path: string, body: any, postBody: any): void {
    const dict: Record<string, any[]> = {
      'api_get_member/questlist': [this.processQuestList],
      'api_req_quest/clearitemget': [this.processClearItemGet],
    }

    const handlers = dict[path] || []
    handlers.forEach(handler => handler.call(this, body, postBody))
  }

  public async send(path: string, data: any) {
    const url = new URL(path, this.BASE_URL)
    try {
      await fetch(url.href, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': `${this.pluginName}/${this.pluginVersion} poi/${this.appVersion}`,
          origin: 'poi',
          'x-origin': this.pluginName,
          'x-version': this.pluginVersion,
        },
        body: JSON.stringify(data),
      })
      console.debug(`[KCRDB] send: OK`, { path })
    } catch (error) {
      if (error instanceof Error) {
        console.error(`[KCRDB] send: ${error.message}`, { path, error })
      }
    }
  }

  private async processQuestList(body: any) {
    const tmpList = body.api_list
    if (!tmpList || !Array.isArray(tmpList)) {
      return
    }

    const tmpItems = tmpList.map(data => {
      const hashObj = this.QUEST_HASH_FIELDS.reduce((obj, key) => {
        if (key in data) {
          Object.assign(obj, { [key]: data[key] })
        }
        return obj
      }, {})
      const hash = KCRDB.hash(JSON.stringify(hashObj))
      return { hash, data }
    })

    const newItems = tmpItems.filter(v => !this.questHashes.has(v.hash))
    if (!newItems.length) {
      return
    }

    const reqBody = { list: newItems.map(v => v.data) }
    await this.send('quests', reqBody)
    newItems.forEach(item => {
      this.questHashes.add(item.hash)
    })
  }

  private async processClearItemGet(body: any, postBody: any) {
    const reqBody: Record<string, any> = {
      api_quest_id: Number(postBody.api_quest_id),
      data: body,
    }

    const apiSelectNoKey = 'api_select_no'
    const apiSelectNoParams = Object.keys(postBody).filter(key => key.startsWith(apiSelectNoKey))
    if (apiSelectNoParams.length > 0) {
      const pos = apiSelectNoKey.length
      apiSelectNoParams.sort((a, b) => Number(a.substring(pos)) - Number(b.substring(pos)))
      reqBody.api_select_no = apiSelectNoParams.map(k => Number(postBody[k]))
    }

    await this.send('quest-items', reqBody)
  }
}
