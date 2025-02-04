function getNetflixTime() {
    const videoPlayer = (window as any).netflix?.appContext?.state?.playerApp?.getAPI()?.videoPlayer;
    const player = videoPlayer?.getVideoPlayerBySessionId(videoPlayer?.getAllPlayerSessionIds()?.[0]);
    const currentTime: number = player?.getCurrentTime?.() || 0;
    const seconds = Math.floor(currentTime / 1000)

    window.postMessage({ type: 'LOUDMOUTH_NETFLIX_TIME', time: seconds }, '*');
}

getNetflixTime();