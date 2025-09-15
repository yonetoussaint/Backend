import axios from "axios";

export async function fetchRepoFiles(repo, token, path = "") {
  const url = `https://api.github.com/repos/${repo}/contents/${path}`;
  const headers = token ? { Authorization: `token ${token}` } : {};

  const { data } = await axios.get(url, { headers });
  let files = [];

  for (const item of data) {
    if (item.type === "file") {
      // item.url is the GitHub API content endpoint (returns base64 content)
      const fileResp = await axios.get(item.url, { headers });
      const base64 = fileResp.data.content || "";
      const content = Buffer.from(base64, "base64").toString("utf8");
      files.push({ path: item.path, content });
    } else if (item.type === "dir") {
      const subFiles = await fetchRepoFiles(repo, token, item.path);
      files = files.concat(subFiles);
    }
  }

  return files;
}