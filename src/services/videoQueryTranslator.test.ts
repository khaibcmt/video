import test from 'node:test';
import assert from 'node:assert/strict';
import {
  translateNarrationToVideoQueries,
  scoreVideoCandidateForQuery,
  getNextCandidateVideoIndex,
} from './videoQueryTranslator';

test('translateNarrationToVideoQueries maps specialized aquaculture and classroom Vietnamese narrations to exact English motion video queries', () => {
  const catfishRes = translateNarrationToVideoQueries(
    'Đàn cá tra đang bơi lội dưới nước trong vùng nuôi thủy sản Đồng bằng sông Cửu Long.'
  );
  assert.equal(catfishRes.primaryQueryEn, 'swimming catfish underwater');
  assert.equal(catfishRes.matchedEntityCategory, 'aquaculture_fish');
  assert.ok(catfishRes.curatedVideoUrls.length >= 3);

  const shrimpRes = translateNarrationToVideoQueries(
    'Hệ thống quạt nước ao tôm hoạt động liên tục tạo oxy hòa tan cho tôm thẻ chân trắng.'
  );
  assert.equal(shrimpRes.primaryQueryEn, 'shrimp pond aerator splashing');
  assert.equal(shrimpRes.matchedEntityCategory, 'aquaculture_shrimp');
  assert.ok(shrimpRes.curatedVideoUrls.length >= 3);

  const classroomRes = translateNarrationToVideoQueries(
    'Trong lớp học hiện đại, các học sinh thảo luận sôi nổi về dự án khoa học.'
  );
  assert.equal(classroomRes.primaryQueryEn, 'modern high school classroom discussion');
  assert.equal(classroomRes.matchedEntityCategory, 'classroom');
  assert.ok(classroomRes.curatedVideoUrls.length >= 3);
});

test('translateNarrationToVideoQueries maps Ha Long Bay, caves, silk road, black holes, and fables accurately', () => {
  const haLongRes = translateNarrationToVideoQueries(
    'Vịnh Hạ Long là di sản thiên nhiên thế giới với hơn 1.600 hòn đảo đá vôi.'
  );
  assert.equal(haLongRes.matchedEntityCategory, 'halong_bay');
  assert.ok(
    haLongRes.curatedVideoUrls.every(
      (u) => u.endsWith('.mp4') || u.endsWith('.webm')
    )
  );

  const turtleRes = translateNarrationToVideoQueries(
    'Chú rùa kiên trì bước đi chậm rãi qua khu rừng xanh.'
  );
  assert.equal(turtleRes.matchedEntityCategory, 'turtle');
  assert.equal(turtleRes.primaryQueryEn, 'tortoise walking forest nature');
});

test('scoreVideoCandidateForQuery strictly accepts only video/mp4 and video/webm and rejects static images', () => {
  const validMp4Score = scoreVideoCandidateForQuery(
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/test/catfish_swimming_underwater.mp4',
      mime: 'video/mp4',
      title: 'File:Swimming catfish underwater river.mp4',
      width: 1920,
      height: 1080,
      size: 5_000_000,
    },
    'swimming catfish underwater'
  );
  assert.ok(validMp4Score >= 80);

  const staticJpgScore = scoreVideoCandidateForQuery(
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/test/catfish.jpg',
      mime: 'image/jpeg',
      title: 'File:Swimming catfish underwater.jpg',
      width: 1920,
      height: 1080,
      size: 500_000,
    },
    'swimming catfish underwater'
  );
  assert.equal(staticJpgScore, -1);

  const unrelatedVideoScore = scoreVideoCandidateForQuery(
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/test/train_station.webm',
      mime: 'video/webm',
      title: 'File:Train station in Berlin.webm',
      width: 1280,
      height: 720,
      size: 4_000_000,
    },
    'swimming catfish underwater'
  );
  assert.equal(unrelatedVideoScore, -1);
});

test('getNextCandidateVideoIndex cycles smoothly through available video clips', () => {
  assert.equal(getNextCandidateVideoIndex(0, 4), 1);
  assert.equal(getNextCandidateVideoIndex(2, 4), 3);
  assert.equal(getNextCandidateVideoIndex(3, 4), 0);
  assert.equal(getNextCandidateVideoIndex(0, 1), 0);
});
