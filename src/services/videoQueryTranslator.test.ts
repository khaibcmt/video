import test from 'node:test';
import assert from 'node:assert/strict';
import {
  translateNarrationToVideoQueries,
  scoreVideoCandidateForQuery,
  getNextCandidateVideoIndex,
} from './videoQueryTranslator';
import {
  normalizeVietnameseNumbers,
  generateAutonomousPedagogicalScenes,
} from './scriptAnalyzer';

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

test('normalizeVietnameseNumbers converts 3.260 km, scientific units, and chemical formulas into full Vietnamese words', () => {
  const normalizedKm = normalizeVietnameseNumbers(
    'Việt Nam có đường bờ biển dài 3.260 km, phân tử H2O, khí CO2 và DO >= 5 mg/l.'
  );
  assert.ok(
    normalizedKm.includes('ba nghìn hai trăm sáu mươi ki-lô-mét'),
    `Expected "ba nghìn hai trăm sáu mươi ki-lô-mét" in: ${normalizedKm}`
  );
  assert.ok(
    normalizedKm.includes('hát hai ô'),
    `Expected "hát hai ô" in: ${normalizedKm}`
  );
  assert.ok(
    normalizedKm.includes('xê ô hai'),
    `Expected "xê ô hai" in: ${normalizedKm}`
  );
  assert.ok(
    normalizedKm.includes('năm mi-li-gam trên lít'),
    `Expected "năm mi-li-gam trên lít" in: ${normalizedKm}`
  );
});

test('generateAutonomousPedagogicalScenes produces 4-part pedagogical structure with visual_beats and directorInstructions', () => {
  const scenes1Min = generateAutonomousPedagogicalScenes(
    'Bài 9: Các nhóm thủy sản và phương thức nuôi phổ biến',
    'Công nghệ',
    60,
    'Phần 1 bối cảnh ao nuôi ĐBSCL; Phần 2 so sánh nuôi quảng canh và thâm canh có quạt nước; hiện công thức DO >= 5 mg/l góc phải'
  );
  assert.equal(scenes1Min.length, 3);
  assert.equal(scenes1Min.reduce((s, c) => s + c.duration_seconds, 0), 60);
  assert.ok(
    scenes1Min.every(
      (s) =>
        s.exact_video_search_en &&
        s.pedagogical_section &&
        s.pedagogical_badge &&
        Array.isArray(s.visual_beats) &&
        s.visual_beats.length >= 2
    )
  );

  const scenes2Min = generateAutonomousPedagogicalScenes(
    'Bài 9: Các nhóm thủy sản và phương thức nuôi phổ biến',
    'Công nghệ',
    120
  );
  assert.equal(scenes2Min.length, 5);
  assert.equal(scenes2Min.reduce((s, c) => s + c.duration_seconds, 0), 120);

  const scenes3Min = generateAutonomousPedagogicalScenes(
    'Quang hợp ở thực vật và chu trình trao đổi chất',
    'Sinh học',
    180
  );
  assert.equal(scenes3Min.length, 7);
  assert.equal(scenes3Min.reduce((s, c) => s + c.duration_seconds, 0), 180);
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
});

test('getNextCandidateVideoIndex cycles smoothly through available video clips', () => {
  assert.equal(getNextCandidateVideoIndex(0, 4), 1);
  assert.equal(getNextCandidateVideoIndex(2, 4), 3);
  assert.equal(getNextCandidateVideoIndex(3, 4), 0);
  assert.equal(getNextCandidateVideoIndex(0, 1), 0);
});
