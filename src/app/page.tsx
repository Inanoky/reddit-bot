import { getPostedRecords } from "@/lib/storage";

export default async function HomePage() {
  const records = await getPostedRecords();

  return (
    <main className="container">
      <h1>WorksRecorded Reddit Bot Dashboard</h1>
      <p>Shows AI comments posted by the hourly Vercel cron job.</p>

      <table>
        <thead>
          <tr>
            <th>Time (UTC)</th>
            <th>Subreddit</th>
            <th>Post</th>
            <th>Comment ID</th>
            <th>Comment Preview</th>
          </tr>
        </thead>
        <tbody>
          {records.length === 0 ? (
            <tr>
              <td colSpan={5}>No posts yet.</td>
            </tr>
          ) : (
            records.map((record) => (
              <tr key={`${record.postId}-${record.commentId}`}>
                <td>{record.postedAt}</td>
                <td>r/{record.subreddit}</td>
                <td>
                  <a href={record.postUrl} target="_blank" rel="noreferrer">
                    {record.postTitle}
                  </a>
                </td>
                <td>{record.commentId}</td>
                <td>{record.commentBody.slice(0, 180)}...</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </main>
  );
}
