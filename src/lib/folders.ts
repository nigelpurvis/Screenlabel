import { supabase } from './supabase'

export async function getFolders() {
  const { data, error } = await supabase
    .from('folders')
    .select('*')
    .order('name')
  if (error) throw error
  return data
}

export async function createFolder(name: string, color?: string) {
  const { data, error } = await supabase
    .from('folders')
    .insert({ name, color: color || '#534AB7' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteFolder(id: string) {
  const { error } = await supabase
    .from('folders')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function assignFolder(screenshotId: string, folderId: string | null) {
  const { error } = await supabase
    .from('screenshots')
    .update({ folder_id: folderId })
    .eq('id', screenshotId)
  if (error) throw error
}

export async function saveNotes(screenshotId: string, notes: string) {
  const { error } = await supabase
    .from('screenshots')
    .update({ notes })
    .eq('id', screenshotId)
  if (error) throw error
}

export async function getScreenshotsByFolder(folderId: string | null) {
  const query = supabase
    .from('screenshots')
    .select('*')
    .order('created_at', { ascending: false })

  if (folderId === null) {
    const { data, error } = await query
    if (error) throw error
    return data
  } else {
    const { data, error } = await query.eq('folder_id', folderId)
    if (error) throw error
    return data
  }
}