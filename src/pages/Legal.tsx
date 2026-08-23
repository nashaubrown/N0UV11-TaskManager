/* Public legal pages — reachable without login (linked from the Meta app
 * settings for App Review): /privacy and /data-deletion. */

function LegalShell({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="nv-gradient text-on-brand">
        <div className="max-w-3xl mx-auto px-5 py-10">
          <p className="font-display font-bold text-xl">NOUVII</p>
          <h1 className="font-display font-bold text-3xl mt-2">{title}</h1>
          <p className="text-sm text-white/75 mt-1">Last updated {updated}</p>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-5 py-8 grid gap-6 text-[15px] leading-relaxed text-ink-2
                       [&_h2]:font-display [&_h2]:font-semibold [&_h2]:text-lg [&_h2]:text-ink [&_h2]:mt-2
                       [&_ul]:list-disc [&_ul]:ml-5 [&_ul]:grid [&_ul]:gap-1.5
                       [&_ol]:list-decimal [&_ol]:ml-5 [&_ol]:grid [&_ol]:gap-1.5">
        {children}
      </main>
      <footer className="max-w-3xl mx-auto px-5 pb-10 text-sm text-ink-muted">
        Questions? Contact <a className="text-brand-deep dark:text-brand font-medium hover:underline" href="mailto:nashaubrown@gmail.com">nashaubrown@gmail.com</a>.
      </footer>
    </div>
  )
}

export function Privacy() {
  return (
    <LegalShell title="Privacy Policy" updated="August 2026">
      <p>
        NOUVII is a task-management and photo-library platform operated by Perx for its photography studio and the
        merchants it works with. This policy explains what data NOUVII collects, how it is used, and how it is deleted.
      </p>

      <h2>Account data</h2>
      <p>
        Team members sign in with a name, email address and password (stored as a salted hash). Client reviewers using a
        shared portal link may provide their name with comments and review decisions.
      </p>

      <h2>Instagram data (Meta Platforms)</h2>
      <p>
        When a merchant connects their Instagram professional account — via Instagram Login or Facebook Login — NOUVII
        accesses the following through Meta's APIs, with the account holder's explicit consent:
      </p>
      <ul>
        <li><strong>Profile information</strong>: username, display name, profile picture, bio, website, and follower / following / post counts.</li>
        <li><strong>Media metadata</strong>: post captions, thumbnails, permalinks, timestamps, like and comment counts, and media the account is tagged in.</li>
        <li><strong>Insight metrics</strong>: reach, impressions, profile views, website clicks, and audience-online times.</li>
      </ul>
      <p>
        Access tokens and the data above are stored in NOUVII's database solely to display analytics, reports and feed
        previews to the merchant and the studio team. NOUVII is <strong>read-only</strong>: it never posts, messages,
        follows, or modifies anything on the connected account.
      </p>

      <h2>What we do not do</h2>
      <ul>
        <li>We do not sell or rent any data.</li>
        <li>We do not share Instagram data with third parties beyond the service providers hosting NOUVII (our database and application hosting).</li>
        <li>We do not use the data for advertising.</li>
      </ul>

      <h2>Photos and project data</h2>
      <p>
        Photos uploaded by the studio, tasks, comments and review feedback are stored to run the service and are visible
        only to the studio team and, where a review link is shared, the intended client reviewer.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        Instagram data is kept only while the account is connected. Disconnecting (see{' '}
        <a className="text-brand-deep dark:text-brand font-medium hover:underline" href="/data-deletion">Data Deletion</a>)
        immediately and permanently deletes the stored tokens, profile data, media metadata and metrics for that account.
        Other account data is deleted on request.
      </p>
    </LegalShell>
  )
}

export function DataDeletion() {
  return (
    <LegalShell title="Data Deletion" updated="August 2026">
      <p>
        You can remove all Instagram data NOUVII holds about an account at any time, in any of these ways. Deletion is
        immediate and permanent — stored access tokens, profile information, media metadata and insight metrics are all
        erased.
      </p>

      <h2>1. Disconnect inside NOUVII (fastest)</h2>
      <ol>
        <li>A studio team member opens the <strong>Analytics</strong> page and selects the merchant.</li>
        <li>Click the <strong>disconnect</strong> (plug) icon next to the Sync button.</li>
        <li>All synced Instagram data and tokens for that account are deleted from the database at that moment.</li>
      </ol>

      <h2>2. Revoke access from Instagram or Facebook</h2>
      <ol>
        <li>In the Instagram app: <strong>Settings → Website permissions → Apps and websites</strong> (or on Facebook: <strong>Settings → Apps and websites</strong>).</li>
        <li>Remove <strong>NOUVII Analytics</strong>. This invalidates NOUVII's access immediately.</li>
        <li>Then request deletion of already-stored data via option 1 or 3.</li>
      </ol>

      <h2>3. Email us</h2>
      <p>
        Send a request to{' '}
        <a className="text-brand-deep dark:text-brand font-medium hover:underline" href="mailto:nashaubrown@gmail.com">nashaubrown@gmail.com</a>{' '}
        from the email associated with the account (or the Instagram handle in question) and we will delete the data and
        confirm within 7 days.
      </p>
    </LegalShell>
  )
}
