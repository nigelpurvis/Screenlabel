import OpenAI from 'openai'
import { readFile } from '@tauri-apps/plugin-fs'
import { supabase } from './supabase'

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
})

export async function ingestScreenshot(filePath: string) {
  const filename = filePath.split('/').pop() || filePath

  // Fix 1: use maybeSingle() instead of single()
  const { data: existing } = await supabase
    .from('screenshots')
    .select('id')
    .eq('storage_path', filePath)
    .maybeSingle()

  if (existing) return { skipped: true }

  const bytes = await readFile(filePath)
  
  // Fix 2: chunked base64 conversion for large files
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  const base64 = btoa(binary)


  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: `data:image/png;base64,${base64}` }
        },
        {
          type: 'text',
          text: 'Describe this screenshot in 2-3 sentences. Then list any visible text. Format: DESCRIPTION: ... TEXT: ...'
        }
      ]
    }]
  })

  const raw = response.choices[0].message.content || ''
  const description = raw.match(/DESCRIPTION:(.*?)(?=TEXT:|$)/s)?.[1]?.trim() || raw
  const extractedText = raw.match(/TEXT:(.*)/s)?.[1]?.trim() || ''

  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: `${description} ${extractedText}`
  })
  const embedding = embeddingResponse.data[0].embedding

  const { error } = await supabase.from('screenshots').insert({
    filename,
    storage_path: filePath,
    description,
    extracted_text: extractedText,
    embedding
  })

  if (error) throw error
  return { success: true, description }
}

export async function searchScreenshots(query: string) {
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query
  })
  const embedding = embeddingResponse.data[0].embedding

  const { data, error } = await supabase.rpc('search_screenshots', {
    query_embedding: embedding,
    match_threshold: 0.4,
    match_count: 20
  })

  if (error) throw error
  return data
}