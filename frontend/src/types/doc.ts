import type Metadata from './metadata'
export default interface Doc {
  id: number
  parent_id: number | null
  title: string
  slug: string
  urlpath: string
  public: boolean
  metadata: Metadata
  markdown: string
  html: string
  created_at: string
  updated_at: string
  updated_by_id: number
  parents: DocInfo[]
  children: DocInfo[]
}

export interface DocInfo {
  id: number
  title: string
  urlpath: string
  public?: boolean
}
