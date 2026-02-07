
import { S3Client, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3'

const R2_ACCOUNT_ID='3b964e63af3f0e752c640e35dab68c9b'
const R2_ACCESS_KEY_ID='4dc8958ee64b91f5031770e8fbeef0e2'
const R2_SECRET_ACCESS_KEY='c6bf57fdb60f9f9546d9e9552a76dd6ef4fa953c26de0ebfc3b7f3b079a2123c'
const R2_BUCKET_NAME='customizerapp-dev'
const R2_ENDPOINT=`https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`

const client = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
})

async function check() {
    console.log(`Checking bucket: ${R2_BUCKET_NAME}`)
    
    // Test Listing
    try {
        const cmd = new ListObjectsV2Command({
            Bucket: R2_BUCKET_NAME,
            MaxKeys: 5,
            Prefix: 'fast-dtf-transfer_myshopify_com/prod/'
        })
        const res = await client.send(cmd)
        console.log('List Result Sample:', res.Contents?.map(c => c.Key))
    } catch (e) {
        console.error('List Failed:', e)
    }
    
    // Test Specific File
    const testKey = 'fast-dtf-transfer_myshopify_com/prod/edMgI7tHzWte/JqDQnsB3/Cyn Patriots 22x18.pdf'
    console.log(`Checking key: ${testKey}`)
    
    try {
        const start = Date.now()
        await client.send(new HeadObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: testKey
        }))
        console.log(`✅ File FOUND in ${Date.now()-start}ms`)
    } catch (e) {
        console.error(`❌ File NOT FOUND: ${e.name} - ${e.message}`)
    }
}

check()
