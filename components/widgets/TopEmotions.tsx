import { Emotion } from "../../lib/data/emotion";

type TopEmotionsProps = {
  className?: string;
  emotions: Emotion[];
  numEmotions: number;
};

export function TopEmotions({ className, emotions, numEmotions }: TopEmotionsProps) {
  className = className || "";

  // TODO: testing
  // console.log(emotions.slice(0, numEmotions));
  const pos_emotions = [
    "Calmness",
    "Concentration",
    "Contemplation",
    "Boredom"
  ];
  const neg_emotions = [
    "Disappointment",
    "Contempt",
    "Sadness",
    "Distress",
    "Anxiety"
  ];
  const pos_metric = emotions
  // .sort((a: Emotion, b: Emotion) => b.score - a.score)
  // .slice(0, numEmotions)
  .filter(emotion => pos_emotions.includes(emotion.name))
  .reduce(
    (acc, emotion) => acc + emotion.score, 0
  );
  const neg_metric = emotions
    // .sort((a: Emotion, b: Emotion) => b.score - a.score)
    // .slice(0, numEmotions)
    .filter(emotion => neg_emotions.includes(emotion.name))
    .reduce(
      (acc, emotion) => acc - emotion.score, 0
    );
  const val = (pos_metric + neg_metric) * 100 * 100 / 100;
  // console.log(val);

  const getActionMessage = () => {
    // TODO: revise metric thresholds based on data analysis
    if (val > 50) {
      return (
        <>
          <strong>Metric: {val}<br></br></strong>
          <strong>Great work, keep up your poker face. :|</strong>
        </>
      );
    } else {
      return (
        <>
          <strong>Metric: {val}<br></br></strong>
          <strong>Calm down, you might be tilting!</strong>
        </>
      );
    }
  };

  return (
    <div className={`${className}`}>
      {emotions
        .sort((a: Emotion, b: Emotion) => b.score - a.score)
        .slice(0, numEmotions)
        .map((emotion, i) => (
          <div key={i} className="mb-3 flex rounded-full border border-neutral-200 text-sm shadow">
            <div className="flex w-10 justify-center rounded-l-full bg-white py-2 pl-5 pr-4 font-medium text-neutral-800">
              <span>{i + 1}</span>
            </div>
            <div className="w-48 bg-neutral-800 px-4 py-2 lowercase text-white">
              <span>{emotion.name}</span>
            </div>
            <div className="flex w-20 justify-center rounded-r-full bg-white py-2 pr-4 pl-3 font-medium text-neutral-800">
              <span>{emotion.score.toFixed(3)}</span>
            </div>
          </div>
        ))
      }
      { getActionMessage() }
    </div>
  );
}

TopEmotions.defaultProps = {
  numEmotions: 3,
};
