/** @format */
const axios = require('axios')
const dotenv = require('dotenv')
dotenv.config()
const { WebClient } = require('@slack/web-api')
const web = new WebClient(process.env.BOT_TOKEN)

const singleTest = false
let lectures = []
let refTime = new Date(Date.now())
let origTime = new Date(Date.now())
// time in minutes between full unprocessed lecture updates
const fullUpdateTime = 120
//time in minutes between content processing api requests
let pingTime = 0.5
const c = [0, -1, -2]
const dateOptions = { month: 'numeric', day: 'numeric' }
axios.defaults.baseURL = 'http://localhost:8000'

const postToSlack = async (lecture, lectureUpdate = false) => {
    let sentence = null
    if (lecture) {
        const sep = '________________________________ \n'
        const lec = `*${lecture.name}* on *${lecture.date}* <${lecture.link}|Link> \n`
        const s = lecture.stage
        if (s === 1) {
            const stage = 'COMPLETE :green_heart:'
            const assignee =
                lecture.assignee.length > 0
                    ? lecture.assignee
                    : 'xxxsn!p3rpr0xxx'
            const fin = `\n*PROCESSING HAS BEEN COMPLETED BY ${assignee}!*\n`
            sentence = lec + stage + fin + sep
        } else {
            const stage =
                s === 0
                    ? 'NOT STARTED :new_moon:'
                    : s === -1
                    ? 'ERROR :octagonal_sign:'
                    : 'IN PROGRESS :first_quarter_moon:'
            const daysOld =
                lecture.daysOld < 2
                    ? ''
                    : `\n*Days Old:* ${lecture.daysOld}:exclamation:`
            const assignee =
                lecture.assignee.length > 0
                    ? `\n*Assignee:* ${lecture.assignee}`
                    : '\n*Assignee:* N/A'
            const comments =
                lecture.comments.length > 0
                    ? `\n*Comments:* ${lecture.comments}`
                    : ''
            const notesDownload =
                lecture.notesVisibility === 'HIDDEN'
                    ? `\n<${lecture.keyframesLink}|Download Notes Here>\n`
                    : '\n'
            sentence =
                lec +
                stage +
                daysOld +
                assignee +
                comments +
                notesDownload +
                sep
        }
    } else {
        const now = new Date(Date.now())
        const nString = new Intl.DateTimeFormat(undefined, {
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric'
        }).format(now)
        sentence = !lectureUpdate
            ? `:bangbang:*Lectures to Check Out ${nString}*:bangbang:`
            : `:exclamation:*Lecture Update ${nString}*:exclamation:`
    }
    let blocks = [
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: sentence
            }
        }
    ]
    try {
        const result = await web.chat.postMessage({
            channel: '#general',
            blocks: blocks
        })
        console.log(result)
    } catch (error) {
        console.log(error)
    }
}

const getContent = (univ_id, semester_id, fullUpdate) => {
    const now = new Date(Date.now())
    axios
        .get(process.env.ENDPOINT + `${univ_id},${semester_id}/`)
        .then(async res => {
            const prevLectures = lectures
            lectures = res.data.data.map(lecture => {
                const v_vis = lecture.videoVisible
                    ? 'VISIBLE'
                    : lecture.videoProcessed
                    ? 'HIDDEN'
                    : 'UNAVAILABLE'
                const p_vis =
                    lecture.pptVisible && lecture.powerpointjson
                        ? 'VISIBLE'
                        : lecture.nppslides
                        ? 'HIDDEN'
                        : 'UNAVAILABLE'
                const n_vis =
                    lecture.notesVisibile && lecture.has_time_block
                        ? 'VISIBLE'
                        : lecture.has_keyframesdl
                        ? 'HIDDEN'
                        : 'UNAVAILABLE'
                let t_vis = 'UNAVAILABLE'
                if (
                    lecture.transcriptVisible &&
                    lecture.transcript !== '' &&
                    lecture.lectureVisible
                ) {
                    t_vis = 'VISIBLE'
                } else if (
                    lecture.transcriptVisible &&
                    lecture.transcript === '' &&
                    lecture.lectureVisible
                ) {
                    t_vis = 'UNAVAILABLE AND VISIBLE'
                }
                const lectureDate = new Date(lecture.date)
                const daysOld = Math.floor(
                    (now - lectureDate) / (1000 * 60 * 60 * 24)
                )
                return {
                    name: lecture.course__nameshort,
                    nameid: lecture.nameid,
                    nameFull: lecture.course__nameshort + '/' + lecture.nameid,
                    date: lectureDate.toLocaleDateString(
                        undefined,
                        dateOptions
                    ),
                    type: lecture.layouttypeFE,
                    stage: lecture.contentproc_stage,
                    assignee: lecture.contentproc_assignee,
                    comments: lecture.contentproc_comments,
                    lectureVisible: lecture.lectureVisible,
                    videoVisibility: v_vis,
                    slidesVisibility: p_vis,
                    notesVisibility: n_vis,
                    transcriptVisibility: t_vis,
                    keyframesLink: lecture.FEkeyframes_dl,
                    link: lecture.short_url,
                    daysOld: daysOld
                }
            })
            const remainingLectures = lectures.filter(lecture => {
                if (lecture.stage === -1) {
                    return true
                } else if (c.includes(lecture.stage) && lecture.daysOld >= 2) {
                    return true
                }
                return false
            })
            if (fullUpdate) {
                await postToSlack(null)
                if (singleTest) {
                    postToSlack(remainingLectures[0])
                } else {
                    remainingLectures.forEach(lec => postToSlack(lec))
                }
            } else {
                const nuLecs = lectures.filter(lec => {
                    const oldLec = prevLectures.find(
                        l => l.nameFull === lec.nameFull
                    )
                    if (oldLec) {
                        if (oldLec.stage != 1 && lec.stage === 1) {
                            return true
                        } else if (oldLec.stage != -1 && lec.stage === -1) {
                            return true
                        }
                        // return oldLec.stage !== lec.stage
                    }
                    return false
                    // else {
                    //     return true
                    // }
                })
                if (nuLecs.length > 0) {
                    await postToSlack(null, true)
                    nuLecs.forEach(lec => postToSlack(lec))
                }
            }
        })
        .catch(error => {
            console.log(error)
        })
}
pingTime *= 60000
const update = () => {
    const now = new Date(Date.now())
    if (now - origTime >= pingTime) {
        const nowHours = now.getHours()
        if (nowHours < 22 && nowHours >= 8) {
            const timeDiff = (now - refTime) / (1000 * 60)
            if (timeDiff >= fullUpdateTime) {
                refTime = new Date(Date.now())
                getContent('ucsd', '2020_winter', true)
            } else {
                getContent('ucsd', '2020_winter', false)
            }
        }
    }
    setTimeout(() => update(), pingTime)
}
getContent('ucsd', '2020_winter', true)
update()
