import { Context, Schema, segment } from 'koishi'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import {} from 'koishi-plugin-puppeteer'
import {} from 'koishi-plugin-markdown-to-image-service'

//

export const name = 'leetcode-daily-question'
export const inject = ['puppeteer', 'markdownToImage']

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

async function fetchQuestionDetails(slug) {
  try {
    const response = await axios.post('https://leetcode.cn/graphql/', {
      query: `
        query questionTranslations($titleSlug: String!) {
          question(titleSlug: $titleSlug) {
            translatedTitle
            translatedContent
          }
        }
      `,
      variables: {
        titleSlug: slug,
      },
      operationName: "questionTranslations",
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Referer': 'https://leetcode.cn/',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      },
    })

    return response.data.data.question
  } catch (error) {
    console.error('Failed to fetch question details:', error)
    return null
  }
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

  function isSameDay(date1, date2) {
    return date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
  }

  ctx.command('每日一题')
    .action(async ({ session }) => {
      const now = new Date()
      if (!cache.question || !isSameDay(now, new Date(cache.lastUpdate))) {
        await fetchDailyQuestion()
      }

      const question = cache.question
      if (question) {
        const details = await fetchQuestionDetails(question.slug)
        if (details) {
          const contentToRender = details.translatedContent
          const isHtml = /<\/?[a-z][\s\S]*>/i.test(contentToRender) // 简单判断是否为HTML
          let imageBuffer

          if (isHtml) {
            const htmlContent = `
              <html>
                <head>
                  <style>
                    body {
                      font-family: Arial, sans-serif;
                      padding: 20px;
                    }
                  </style>
                </head>
                <body>
                  <h1>${details.translatedTitle}</h1>
                  ${contentToRender}
                </body>
              </html>
            `
            try {
              const page = await ctx.puppeteer.page()
              await page.setContent(htmlContent, { waitUntil: 'networkidle0' })
              imageBuffer = await page.screenshot({ fullPage: true })
            } catch (error) {
              console.error('Failed to render page:', error)
              session.send('题目截图获取失败，请稍后再试。')
              return
            }
          } else {
            const markdownContent = `# ${details.translatedTitle}\n\n${contentToRender}`
            try {
              imageBuffer = await ctx.markdownToImage.convertToImage(markdownContent)
            } catch (error) {
              console.error('Failed to convert markdown to image:', error)
              session.send('题目截图获取失败，请稍后再试。')
              return
            }
          }

          await session.send(`今日题目: ${details.translatedTitle}\n链接: ${question.link}`)
          await session.send(segment.image(imageBuffer, 'image/png'))
        } else {
          session.send('题目详情获取失败，请稍后再试。')
        }
      } else {
        session.send('今日题目获取失败，请稍后再试。')
      }
    })
}
