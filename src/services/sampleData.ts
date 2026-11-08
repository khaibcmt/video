import { Scene, SubjectOption, CameraMotion, LutStyle } from '../types';
import { translateNarrationToVideoQueries } from './videoQueryTranslator';

export const PRESET_SAMPLE_SCENES: Record<string, Scene[]> = {
  bai_9_thuy_san: [
    {
      scene_id: 1,
      title: 'Phần 1: Khởi Động - Tiềm Năng Thủy Sản Việt Nam',
      pedagogical_section: 'Phần 1: Mở đầu & Đặt vấn đề',
      narration_vi:
        'Chào mừng các em đến với Bài 9: Các nhóm thủy sản và phương thức nuôi phổ biến. Việt Nam sở hữu bờ biển dài hơn 3.260 km cùng hơn 1.000.000 ha mặt nước nuôi trồng thủy sản trù phú.',
      narration_normalized:
        'Chào mừng các em đến với Bài chín: Các nhóm thủy sản và phương thức nuôi phổ biến. Việt Nam sở hữu bờ biển dài hơn ba nghìn hai trăm sáu mươi ki-lô-mét cùng hơn một triệu héc-ta mặt nước nuôi trồng thủy sản trù phú.',
      exact_video_search_en: 'swimming catfish underwater',
      search_keywords_en: 'swimming catfish underwater',
      wikipedia_topic_en: 'Aquaculture in Vietnam',
      camera_motion: 'zoom-in',
      lut_style: 'cinematic-teal-orange',
      duration_seconds: 12,
    },
    {
      scene_id: 2,
      title: 'Phần 2: Phân Loại Các Nhóm Thủy Sản',
      pedagogical_section: 'Phần 2: Kiến thức trọng tâm 1',
      narration_vi:
        'Dựa vào đặc điểm sinh học và môi trường sống, thủy sản được chia thành nhóm cá nước ngọt như cá tra, cá rô phi và nhóm giáp xác, nhuyễn thể có giá trị kinh tế cao như tôm sú, tôm thẻ chân trắng.',
      narration_normalized:
        'Dựa vào đặc điểm sinh học và môi trường sống, thủy sản được chia thành nhóm cá nước ngọt như cá tra, cá rô phi và nhóm giáp xác, nhuyễn thể có giá trị kinh tế cao như tôm sú, tôm thẻ chân trắng.',
      exact_video_search_en: 'fish swimming underwater aquarium',
      search_keywords_en: 'fish swimming underwater aquarium',
      wikipedia_topic_en: 'Catfish',
      camera_motion: 'pan-right',
      lut_style: 'natural-documentary',
      duration_seconds: 12,
    },
    {
      scene_id: 3,
      title: 'Phần 3: Phương Thức Nuôi Thâm Canh Công Nghệ Cao',
      pedagogical_section: 'Phần 3: Kiến thức trọng tâm 2',
      narration_vi:
        'Trong phương thức nuôi thâm canh và bán thâm canh hiện đại, hệ thống quạt nước ao tôm hoạt động liên tục giúp duy trì hàm lượng oxy hòa tan trên 5 mg/l, nâng năng suất lên hơn 25 tấn trên 1 ha.',
      narration_normalized:
        'Trong phương thức nuôi thâm canh và bán thâm canh hiện đại, hệ thống quạt nước ao tôm hoạt động liên tục giúp duy trì hàm lượng oxy hòa tan trên năm mi-li-gam trên lít, nâng năng suất lên hơn hai mươi lăm tấn trên một héc-ta.',
      exact_video_search_en: 'shrimp pond aerator splashing',
      search_keywords_en: 'shrimp pond aerator splashing',
      wikipedia_topic_en: 'Shrimp farming',
      camera_motion: 'zoom-out',
      lut_style: 'warm-golden',
      duration_seconds: 13,
    },
    {
      scene_id: 4,
      title: 'Phần 4: Ứng Dụng Nuôi Lồng Bè & Tổng Kết',
      pedagogical_section: 'Phần 4: Ứng dụng thực tiễn & Tổng kết',
      narration_vi:
        'Kết hợp nuôi lồng bè trên sông biển cùng quy trình VietGAP giúp ngành thủy sản Việt Nam xuất khẩu đạt hơn 9.000.000.000 USD mỗi năm, bảo vệ hệ sinh thái bền vững.',
      narration_normalized:
        'Kết hợp nuôi lồng bè trên sông biển cùng quy trình Việt Gáp giúp ngành thủy sản Việt Nam xuất khẩu đạt hơn chín tỷ đô-la mỹ mỗi năm, bảo vệ hệ sinh thái bền vững.',
      exact_video_search_en: 'fishing village boats emerald water',
      search_keywords_en: 'fishing village boats emerald water',
      wikipedia_topic_en: 'Fish farming',
      camera_motion: 'pan-left',
      lut_style: 'cinematic-teal-orange',
      duration_seconds: 12,
    },
  ],

  vinh_ha_long: [
    {
      scene_id: 1,
      title: 'Phần 1: Kỳ Quan Thiên Nhiên Vịnh Hạ Long',
      pedagogical_section: 'Phần 1: Mở đầu & Đặt vấn đề',
      narration_vi:
        'Vịnh Hạ Long là di sản thiên nhiên thế giới với hơn 1.600 hòn đảo đá vôi kỳ vĩ trải rộng trên diện tích 1.553 km2.',
      narration_normalized:
        'Vịnh Hạ Long là di sản thiên nhiên thế giới với hơn một nghìn sáu trăm hòn đảo đá vôi kỳ vĩ trải rộng trên diện tích một nghìn năm trăm năm mươi ba ki-lô-mét vuông.',
      exact_video_search_en: 'Ha Long Bay Vietnam aerial boat',
      search_keywords_en: 'Ha Long Bay Vietnam aerial boat',
      wikipedia_topic_en: 'Hạ Long Bay',
      camera_motion: 'zoom-in',
      lut_style: 'cinematic-teal-orange',
      duration_seconds: 10,
    },
    {
      scene_id: 2,
      title: 'Phần 2: Kiến Tạo Địa Chất Hang Động',
      pedagogical_section: 'Phần 2: Kiến thức trọng tâm 1',
      narration_vi:
        'Trải qua hơn 500 triệu năm kiến tạo địa chất, hệ thống hang động như động Thiên Cung, hang Sửng Sốt với chiều dài hơn 120 mét sở hữu thạch nhũ huyền ảo.',
      narration_normalized:
        'Trải qua hơn năm trăm triệu năm kiến tạo địa chất, hệ thống hang động như động Thiên Cung, hang Sửng Sốt với chiều dài hơn một trăm hai mươi mét sở hữu thạch nhũ huyền ảo.',
      exact_video_search_en: 'cave stalactites cavern underground',
      search_keywords_en: 'cave stalactites cavern underground',
      wikipedia_topic_en: 'Sửng Sốt Cave',
      camera_motion: 'pan-right',
      lut_style: 'warm-golden',
      duration_seconds: 11,
    },
    {
      scene_id: 3,
      title: 'Phần 3: Hệ Sinh Thái & Văn Hóa Làng Chài',
      pedagogical_section: 'Phần 4: Ứng dụng thực tiễn & Tổng kết',
      narration_vi:
        'Mỗi năm, nơi đây đón hơn 4.000.000 lượt du khách quốc tế chiêm ngưỡng làn nước xanh ngọc bích và nhịp sống yên bình của các làng chài cổ kính.',
      narration_normalized:
        'Mỗi năm, nơi đây đón hơn bốn triệu lượt du khách quốc tế chiêm ngưỡng làn nước xanh ngọc bích và nhịp sống yên bình của các làng chài cổ kính.',
      exact_video_search_en: 'fishing village boats emerald water',
      search_keywords_en: 'fishing village boats emerald water',
      wikipedia_topic_en: 'Cửa Vạn',
      camera_motion: 'zoom-out',
      lut_style: 'natural-documentary',
      duration_seconds: 10,
    },
  ],

  ho_den_vu_tru: [
    {
      scene_id: 1,
      title: 'Phần 1: Khởi Động - Vực Thẳm Không Thời Gian',
      pedagogical_section: 'Phần 1: Mở đầu & Đặt vấn đề',
      narration_vi:
        'Hố đen là một trong những thực thể vật lý thiên văn bí ẩn và quyền năng nhất trong vũ trụ bao la.',
      narration_normalized:
        'Hố đen là một trong những thực thể vật lý thiên văn bí ẩn và quyền năng nhất trong vũ trụ bao la.',
      exact_video_search_en: 'black hole accretion disk space',
      search_keywords_en: 'black hole accretion disk space',
      wikipedia_topic_en: 'Black hole',
      camera_motion: 'zoom-in',
      lut_style: 'high-contrast',
      duration_seconds: 9,
    },
    {
      scene_id: 2,
      title: 'Phần 2: Chân Trời Sự Kiện & Vận Tốc Ánh Sáng',
      pedagogical_section: 'Phần 2: Kiến thức trọng tâm 1',
      narration_vi:
        'Với lực hấp dẫn cực đại, ngay cả ánh sáng di chuyển với vận tốc 300.000 km/s cũng không thể thoát khỏi chân trời sự kiện.',
      narration_normalized:
        'Với lực hấp dẫn cực đại, ngay cả ánh sáng di chuyển với vận tốc ba trăm nghìn ki-lô-mét trên giây cũng không thể thoát khỏi chân trời sự kiện.',
      exact_video_search_en: 'Milky Way galaxy night sky stars',
      search_keywords_en: 'Milky Way galaxy night sky stars',
      wikipedia_topic_en: 'Event horizon',
      camera_motion: 'pan-right',
      lut_style: 'cinematic-teal-orange',
      duration_seconds: 10,
    },
    {
      scene_id: 3,
      title: 'Phần 3: Hố Đen Trung Tâm Dải Ngân Hà',
      pedagogical_section: 'Phần 4: Ứng dụng thực tiễn & Tổng kết',
      narration_vi:
        'Hố đen siêu khối lượng ở trung tâm Dải Ngân Hà có khối lượng gấp 4.000.000 lần Mặt Trời, minh chứng sống động cho thuyết tương đối rộng của Einstein.',
      narration_normalized:
        'Hố đen siêu khối lượng ở trung tâm Dải Ngân Hà có khối lượng gấp bốn triệu lần Mặt Trời, minh chứng sống động cho thuyết tương đối rộng của Anh-xtanh.',
      exact_video_search_en: 'black hole gravitational lensing cosmos',
      search_keywords_en: 'black hole gravitational lensing cosmos',
      wikipedia_topic_en: 'Sagittarius A*',
      camera_motion: 'zoom-out',
      lut_style: 'high-contrast',
      duration_seconds: 10,
    },
  ],
};

export function matchSamplePreset(text: string): Scene[] | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  if (
    lower.includes('thủy sản') ||
    lower.includes('thuy san') ||
    lower.includes('bài 9') ||
    lower.includes('cá tra') ||
    lower.includes('ao tôm')
  ) {
    return PRESET_SAMPLE_SCENES.bai_9_thuy_san;
  }
  if (lower.includes('hạ long') || lower.includes('ha long')) {
    return PRESET_SAMPLE_SCENES.vinh_ha_long;
  }
  if (lower.includes('hố đen') || lower.includes('ho den') || lower.includes('black hole')) {
    return PRESET_SAMPLE_SCENES.ho_den_vu_tru;
  }
  return null;
}

/**
 * Target number of pedagogical scenes based on Director Duration selection:
 * - 60s (1 Phút) -> 3 scenes
 * - 120s (2 Phút) -> 5 scenes
 * - 180s (3 Phút) -> 7 scenes
 */
export function getTargetSceneCountForDuration(durationSec: number): number {
  if (durationSec <= 75) return 3;
  if (durationSec <= 150) return 5;
  return 7;
}
