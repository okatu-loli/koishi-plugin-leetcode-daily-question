import { Context, Schema } from 'koishi'
import axios from 'axios'
import fs from 'fs'
import path from 'path'

export const name = 'leetcode-daily-question'

const cacheFilePath = path.resolve(__dirname, 'cache.json')

function loadCache() {
  if (fs.existsSync(cacheFilePath)) {
    const data = fs.readFileSync(cacheFilePath, 'utf-8')
    return JSON.parse(data)
  }
  return {
    question: null,
    lastUpdate: null,
  }
}

function saveCache(cache) {
  fs.writeFileSync(cacheFilePath, JSON.stringify(cache), 'utf-8')
}

export function apply(ctx: Context) {
  const cache = loadCache()

  async function fetchDailyQuestion() {
    try {
      const response = await axios.post('https://leetcode.cn/graphql/', {
        query: `
          query CalendarTaskSchedule($days: Int!) {
            calendarTaskSchedule(days: $days) {
              dailyQuestions {
                id
                name
                slug
                link
                premiumOnly
                progress
              }
            }
          }
        `,
        variables: {
          days: 0,
        },
        operationName: "CalendarTaskSchedule",
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Referer': 'https://leetcode.cn/',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
        },
      })

      const question = response.data.data.calendarTaskSchedule.dailyQuestions[0]
      cache.question = question
      cache.lastUpdate = new Date()
      saveCache(cache)
    } catch (error) {
      console.error('Failed to fetch daily question:', error)
    }
  }

  function isSameDay(date1: Date, date2: Date): boolean {
    return date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
  }

  ctx.command('每日一题', '获取每日一题')
    .action(async ({ session }) => {
      const now = new Date()
      if (!cache.question || !isSameDay(now, new Date(cache.lastUpdate))) {
        await fetchDailyQuestion()
      }

      const question = cache.question
      if (question) {
        session.send(`今日题目: ${question.name}\n链接: ${question.link}`)
      } else {
        session.send('今日题目获取失败，请稍后再试。')
      }
    })
}
