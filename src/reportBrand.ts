import logo from './assets/mic-logo.jpg'

// Use the receipt's original artwork and contact details on every report.
export const reportBrand = {
  logo,
  name: 'Masum IT Cottage',
  tagline: 'ALL IT ACCESSORIES SALES & SOLUTIONS',
  address: ['Ovijhan - 3/1, Plabon Bhaban,', 'Surtaranga Road, Cheragali, Tongi, Gazipur.'],
  phone: '01717-270738, 01730-898910',
  email: 'masum0008@gmail.com',
  facebook: 'facebook.com/mic.bangladesh',
}

let logoData: Promise<string> | undefined
export function reportLogoDataUrl(): Promise<string> {
  if (reportBrand.logo.startsWith('data:')) return Promise.resolve(reportBrand.logo)
  if (!logoData) {
    logoData = fetch(reportBrand.logo).then(response => {
      if (!response.ok) throw new Error('Could not load report logo')
      return response.blob()
    }).then(blob => new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('Could not read report logo'))
      reader.readAsDataURL(blob)
    })).catch(error => { logoData = undefined; throw error })
  }
  return logoData
}
