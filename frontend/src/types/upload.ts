export default interface Upload {
  id: number
  filename: string
  content_type: string
  public: boolean
  size: number
  doc_id: number | null
  created_at: string
  updated_at: string
}
