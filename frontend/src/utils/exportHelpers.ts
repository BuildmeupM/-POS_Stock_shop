import api from '../services/api'

/**
 * Download an Excel file from the API
 */
export async function downloadExcel(url: string, filename: string) {
  const response = await api.get(url, { responseType: 'blob' })
  const blob = new Blob([response.data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(link.href)
}

/**
 * Upload an Excel file for product import
 */
export async function uploadProductsExcel(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  const response = await api.post('/imports/products', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return response.data as {
    message: string
    imported: number
    updated: number
    skipped: number
    total: number
    errors: string[]
  }
}
