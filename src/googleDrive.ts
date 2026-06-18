const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const GOOGLE_IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client'

type DriveUploadResult = {
  fileId: string
  webViewLink?: string
}

type GoogleTokenResponse = {
  access_token?: string
  error?: string
}

type GoogleTokenClient = {
  requestAccessToken: (options?: { prompt?: string }) => void
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (response: GoogleTokenResponse) => void
          }) => GoogleTokenClient
        }
      }
    }
  }
}

const driveClientId = import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID
const driveFolderId = import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID

let gisLoadPromise: Promise<void> | null = null
let driveAccessToken = ''

function ensureDriveConfigured() {
  if (!driveClientId || !driveFolderId) {
    throw new Error('drive/config-missing')
  }
}

function inferMimeType(dataUrl: string) {
  const mimeMatch = dataUrl.match(/^data:(.*?);base64,/)
  return mimeMatch?.[1] || 'image/jpeg'
}

function dataUrlToBlob(dataUrl: string) {
  const [header, content] = dataUrl.split(',')

  if (!header || !content) {
    throw new Error('drive/invalid-image')
  }

  const mimeType = inferMimeType(dataUrl)
  const binary = atob(content)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return new Blob([bytes], { type: mimeType })
}

async function loadGoogleIdentityScript() {
  if (window.google?.accounts?.oauth2) {
    return
  }

  if (!gisLoadPromise) {
    gisLoadPromise = new Promise<void>((resolve, reject) => {
      const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_IDENTITY_SCRIPT}"]`)

      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(), { once: true })
        existingScript.addEventListener('error', () => reject(new Error('drive/script-load-failed')), { once: true })
        return
      }

      const script = document.createElement('script')
      script.src = GOOGLE_IDENTITY_SCRIPT
      script.async = true
      script.defer = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('drive/script-load-failed'))
      document.head.append(script)
    })
  }

  await gisLoadPromise
}

async function requestDriveAccessToken() {
  ensureDriveConfigured()
  await loadGoogleIdentityScript()

  if (!window.google?.accounts?.oauth2) {
    throw new Error('drive/script-load-failed')
  }

  return new Promise<string>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error('drive/authorization-timeout')), 90000)
    const oauthClient = window.google!.accounts!.oauth2!

    const tokenClient = oauthClient.initTokenClient({
      client_id: driveClientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        window.clearTimeout(timeoutId)

        if (response.error) {
          reject(new Error(`drive/${response.error}`))
          return
        }

        if (!response.access_token) {
          reject(new Error('drive/access-token-missing'))
          return
        }

        driveAccessToken = response.access_token
        resolve(response.access_token)
      },
    })

    tokenClient.requestAccessToken({ prompt: driveAccessToken ? '' : 'consent' })
  })
}

export async function uploadImageToGoogleDrive(options: {
  dataUrl: string
  fileName: string
}): Promise<DriveUploadResult> {
  ensureDriveConfigured()

  const token = await requestDriveAccessToken()
  const imageBlob = dataUrlToBlob(options.dataUrl)
  const boundary = `dermatips-${Date.now()}`
  const metadata = {
    name: options.fileName,
    parents: [driveFolderId],
  }

  const body = new Blob(
    [
      `--${boundary}\r\n`,
      'Content-Type: application/json; charset=UTF-8\r\n\r\n',
      `${JSON.stringify(metadata)}\r\n`,
      `--${boundary}\r\n`,
      `Content-Type: ${imageBlob.type}\r\n\r\n`,
      imageBlob,
      `\r\n--${boundary}--`,
    ],
    { type: `multipart/related; boundary=${boundary}` },
  )

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  )

  if (!response.ok) {
    if (response.status === 401) {
      driveAccessToken = ''
      throw new Error('drive/unauthorized')
    }

    if (response.status === 403) {
      throw new Error('drive/access-denied')
    }

    if (response.status === 404) {
      throw new Error('drive/folder-not-found')
    }

    throw new Error('drive/upload-failed')
  }

  const payload = (await response.json()) as DriveUploadResult

  return payload
}
