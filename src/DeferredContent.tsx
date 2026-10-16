import { Component, Suspense, type ReactNode } from 'react'
import type { Lang } from './model'

const copy = {
  en: { failed: 'This part of the workspace could not load. Check your connection, then reload.', retry: 'Reload' },
  bn: { failed: 'কর্মক্ষেত্রের এই অংশটি লোড করা যায়নি। সংযোগ পরীক্ষা করে আবার লোড করুন।', retry: 'আবার লোড করুন' },
}

export class DeferredContent extends Component<{ lang: Lang; fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    const t = copy[this.props.lang]
    if (this.state.failed) return <div className="deferred-content" role="alert"><p>{t.failed}</p><button type="button" className="secondary-button" onClick={() => window.location.reload()}>{t.retry}</button></div>
    return <Suspense fallback={this.props.fallback}>{this.props.children}</Suspense>
  }
}
