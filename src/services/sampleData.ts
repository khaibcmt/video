import { Scene } from '../types';

export const PRESET_SAMPLE_SCENES: Record<string, Scene[]> = {
  vinh_ha_long: [
    {
      scene_id: 1,
      title: 'Kỳ Quan Vịnh Hạ Long',
      narration_vi: 'Vịnh Hạ Long là di sản thiên nhiên thế giới với hơn 1.600 hòn đảo đá vôi kỳ vĩ trải rộng trên diện tích 1.553 km2.',
      narration_normalized: 'Vịnh Hạ Long là di sản thiên nhiên thế giới với hơn một nghìn sáu trăm hòn đảo đá vôi kỳ vĩ trải rộng trên diện tích một nghìn năm trăm năm mươi ba ki-lô-mét vuông.',
      search_keywords_en: 'Ha Long Bay limestone cliffs vietnam',
      camera_motion: 'zoom-in',
      lut_style: 'cinematic-teal-orange',
      duration_seconds: 9,
    },
    {
      scene_id: 2,
      title: 'Hang Động Lung Linh',
      narration_vi: 'Trải qua hơn 500 triệu năm kiến tạo địa chất, hệ thống hang động như động Thiên Cung, hang Sửng Sốt với chiều dài hơn 120 mét sở hữu thạch nhũ huyền ảo.',
      narration_normalized: 'Trải qua hơn năm trăm triệu năm kiến tạo địa chất, hệ thống hang động như động Thiên Cung, hang Sửng Sốt với chiều dài hơn một trăm hai mươi mét sở hữu thạch nhũ huyền ảo.',
      search_keywords_en: 'Sung Sot cave stalactite Ha Long',
      camera_motion: 'pan-right',
      lut_style: 'warm-golden',
      duration_seconds: 11,
    },
    {
      scene_id: 3,
      title: 'Làn Nước Ngọc Bích',
      narration_vi: 'Mỗi năm, nơi đây đón hơn 4.000.000 lượt du khách quốc tế chiêm ngưỡng làn nước xanh ngọc bích và nhịp sống yên bình của các làng chài cổ kính.',
      narration_normalized: 'Mỗi năm, nơi đây đón hơn bốn triệu lượt du khách quốc tế chiêm ngưỡng làn nước xanh ngọc bích và nhịp sống yên bình của các làng chài cổ kính.',
      search_keywords_en: 'Ha Long Bay floating fishing village emerald water',
      camera_motion: 'zoom-out',
      lut_style: 'natural-documentary',
      duration_seconds: 10,
    },
  ],

  con_duong_to_lua: [
    {
      scene_id: 1,
      title: 'Tuyến Giao Thương Huyền Thoại',
      narration_vi: 'Con Đường Tơ Lụa là mạng lưới giao thương cổ đại vĩ đại nhất nhân loại, trải dài hơn 6.400 km nối liền phương Đông và phương Tây.',
      narration_normalized: 'Con Đường Tơ Lụa là mạng lưới giao thương cổ đại vĩ đại nhất nhân loại, trải dài hơn sáu nghìn bốn trăm ki-lô-mét nối liền phương Đông và phương Tây.',
      search_keywords_en: 'ancient Silk Road desert caravan',
      camera_motion: 'zoom-in',
      lut_style: 'warm-golden',
      duration_seconds: 10,
    },
    {
      scene_id: 2,
      title: 'Đoàn Thương Buôn Sa Mạc',
      narration_vi: 'Khởi nguồn từ thế kỷ 2 trước Công nguyên, các đoàn thương buôn vượt sa mạc khắc nghiệt với hơn 100 con lạc đà thồ lụa, gia vị và gốm sứ quý giá.',
      narration_normalized: 'Khởi nguồn từ thế kỷ hai trước Công nguyên, các đoàn thương buôn vượt sa mạc khắc nghiệt với hơn một trăm con lạc đà thồ lụa, gia vị và gốm sứ quý giá.',
      search_keywords_en: 'camel caravan sand dunes Dunhuang',
      camera_motion: 'pan-left',
      lut_style: 'cinematic-teal-orange',
      duration_seconds: 11,
    },
    {
      scene_id: 3,
      title: 'Di Sản Văn Hóa Bất Tận',
      narration_vi: 'Tuyến đường không chỉ trao đổi hàng hóa trị giá hàng triệu lượng vàng mà còn lan tỏa tri thức, nghệ thuật và triết học qua hơn 1.500 năm lịch sử.',
      narration_normalized: 'Tuyến đường không chỉ trao đổi hàng hóa trị giá hàng triệu lượng vàng mà còn lan tỏa tri thức, nghệ thuật và triết học qua hơn một nghìn năm trăm năm lịch sử.',
      search_keywords_en: 'Samarkand ancient architecture Silk Road',
      camera_motion: 'zoom-out',
      lut_style: 'natural-documentary',
      duration_seconds: 10,
    },
  ],

  ho_den_vu_tru: [
    {
      scene_id: 1,
      title: 'Vực Thẳm Không Thời Gian',
      narration_vi: 'Hố đen là một trong những thực thể bí ẩn và quyền năng nhất trong vũ trụ bao la.',
      narration_normalized: 'Hố đen là một trong những thực thể bí ẩn và quyền năng nhất trong vũ trụ bao la.',
      search_keywords_en: 'black hole deep space nebula',
      camera_motion: 'zoom-in',
      lut_style: 'high-contrast',
      duration_seconds: 7,
    },
    {
      scene_id: 2,
      title: 'Chân Trời Sự Kiện',
      narration_vi: 'Với lực hấp dẫn vô hạn, ngay cả ánh sáng di chuyển với vận tốc 300.000 km/s cũng không thể trốn thoát khỏi chân trời sự kiện.',
      narration_normalized: 'Với lực hấp dẫn vô hạn, ngay cả ánh sáng di chuyển với vận tốc ba trăm nghìn ki-lô-mét trên giây cũng không thể trốn thoát khỏi chân trời sự kiện.',
      search_keywords_en: 'black hole accretion disk event horizon',
      camera_motion: 'pan-right',
      lut_style: 'cinematic-teal-orange',
      duration_seconds: 10,
    },
    {
      scene_id: 3,
      title: 'Trọng Tâm Dải Ngân Hà',
      narration_vi: 'Hố đen siêu khối lượng ở trung tâm Dải Ngân Hà có khối lượng gấp 4.000.000 lần Mặt Trời, bẻ cong thời gian và không gian kỳ vĩ.',
      narration_normalized: 'Hố đen siêu khối lượng ở trung tâm Dải Ngân Hà có khối lượng gấp bốn triệu lần Mặt Trời, bẻ cong thời gian và không gian kỳ vĩ.',
      search_keywords_en: 'Sagittarius A milky way center black hole',
      camera_motion: 'zoom-out',
      lut_style: 'high-contrast',
      duration_seconds: 9,
    },
  ],

  ca_phe_viet_nam: [
    {
      scene_id: 1,
      title: 'Vương Quốc Cà Phê Robusta',
      narration_vi: 'Việt Nam tự hào là quốc gia xuất khẩu cà phê Robusta số 1 thế giới với sản lượng hơn 1.600.000 tấn mỗi năm, chiếm 18% thị phần toàn cầu.',
      narration_normalized: 'Việt Nam tự hào là quốc gia xuất khẩu cà phê Robusta số một thế giới với sản lượng hơn một triệu sáu trăm nghìn tấn mỗi năm, chiếm mười tám phần trăm thị phần toàn cầu.',
      search_keywords_en: 'vietnam coffee beans harvest plantation',
      camera_motion: 'zoom-in',
      lut_style: 'warm-golden',
      duration_seconds: 11,
    },
    {
      scene_id: 2,
      title: 'Đất Đỏ Bazan Tây Nguyên',
      narration_vi: 'Từ những đồn điền bạt ngàn tại Buôn Ma Thuột với độ cao trên 800 mét so với mực nước biển, từng hạt cà phê chín mọng được nâng niu.',
      narration_normalized: 'Từ những đồn điền bạt ngàn tại Buôn Ma Thuột với độ cao trên tám trăm mét so với mực nước biển, từng hạt cà phê chín mọng được nâng niu.',
      search_keywords_en: 'Buon Ma Thuot central highlands coffee farm',
      camera_motion: 'pan-left',
      lut_style: 'natural-documentary',
      duration_seconds: 9,
    },
    {
      scene_id: 3,
      title: 'Hương Vị Phin Đậm Đà',
      narration_vi: 'Ly cà phê phin đậm đà nhỏ từng giọt hòa quyện cùng sữa đặc ngọt ngào đã trở thành biểu tượng văn hóa độc đáo của người Việt.',
      narration_normalized: 'Ly cà phê phin đậm đà nhỏ từng giọt hòa quyện cùng sữa đặc ngọt ngào đã trở thành biểu tượng văn hóa độc đáo của người Việt.',
      search_keywords_en: 'vietnamese traditional drip phin coffee condensed milk',
      camera_motion: 'zoom-out',
      lut_style: 'warm-golden',
      duration_seconds: 9,
    },
  ],
};

export function matchSamplePreset(text: string): Scene[] | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  if (lower.includes('hạ long') || lower.includes('ha long')) {
    return PRESET_SAMPLE_SCENES.vinh_ha_long;
  }
  if (lower.includes('tơ lụa') || lower.includes('to lua') || lower.includes('silk road')) {
    return PRESET_SAMPLE_SCENES.con_duong_to_lua;
  }
  if (lower.includes('hố đen') || lower.includes('ho den') || lower.includes('black hole')) {
    return PRESET_SAMPLE_SCENES.ho_den_vu_tru;
  }
  if (lower.includes('cà phê') || lower.includes('ca phe') || lower.includes('robusta')) {
    return PRESET_SAMPLE_SCENES.ca_phe_viet_nam;
  }
  return null;
}
