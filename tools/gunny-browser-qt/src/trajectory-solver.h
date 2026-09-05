#pragma once

#include <QPointF>
#include <QString>
#include <QVector>

// Trạng thái ngắm, do bản vá SWF báo ra mỗi 40ms (lệnh "d:1").
//
// Toạ độ nhân vật là toạ độ MAP; origin/scale để đổi sang toạ độ sân khấu:
//   sân khấu = origin + điểm_map * scale
struct AimState
{
    double x = 0;         // selfGamePlayer.pos
    double y = 0;
    double angleDeg = 0;  // calcBombAngle(): đã gộp hướng quay + độ dốc địa hình
    double wind = 0;      // Current.wind — con số hiện trên giao diện, chưa đổi ra lực
    double windRate = 1;  // Current.windRate — hệ số server gửi kèm gói gió
    double gravity = 9.8; // map.gravity
    double drag = 2;      // map.airResistance
    // Vị trí nhân vật trên sân khấu: map.localToGlobal(pos). Mọi điểm khác quy
    // chiếu theo độ lệch so với điểm này, nên kéo bản đồ thì đường vẽ đi theo.
    double anchorX = 0;
    double anchorY = 0;
    double scale = 1;     // map.scaleX
    // Bốn hệ số của viên đạn đang dùng (BallInfo.Template). Đây mới là bộ số mà
    // đạn thật chạy theo — xem phy/object/Physics.as:137-145. 0 = không tra được,
    // khi đó rơi về bộ hằng số của đường trợ giúp ngắm.
    double ballMass = 0;
    double ballWeight = 0;
    double ballWind = 0;
    double ballDrag = 0;
    // Toạ độ (map) của mọi địch còn sống, chưa ẩn. Bản vá tự quét
    // Current.livings.list chứ không hỏi gameView.currentLivID — cái đó chỉ được
    // gán khi người chơi có món trợ giúp ngắm.
    QVector<QPointF> foes;
    bool valid = false;

    // Địch gần mình nhất; trả về false khi chưa thấy con nào.
    bool nearestFoe(QPointF *out) const;

    // Đọc một dòng "aim <x> <y> <góc> <gió> <rate> <trọng lực> <cản> <ox> <oy>
    // <scale> <mass> <weight> <wind> <drag> foes <x>,<y>;<x>,<y>;".
    // Trả về trạng thái invalid nếu dòng không đủ trường.
    static AimState parse(const QString &line);
};

namespace trajectory {

// Mô phỏng đường đạn, trả về các điểm theo toạ độ MAP.
//
// Chép nguyên vòng Euler của game (phy/math/EulerVector.as ComputeOneEulerStep +
// GameViewBase.getRouteData) nên hình dạng khớp với đường đạn thật, miễn là các
// hằng số bên dưới còn đúng.
QVector<QPointF> simulate(const AimState &state, double power, int maxSteps = 1500);

// Hằng số lấy từ GameViewBase.as:233-253. Để lộ ra ngoài để còn hiệu chỉnh.
extern const double kMass;           // 10
extern const double kDt;             // 0.04
extern const double kGravityFactor;  // 70
extern const double kMaxPower;       // 2000, bằng EnergyView.FORCE_MAX

// Lực gió = wind * windRate * kWindFactor.
//
// Game tính `_mapWind = windRaw * rate / 10 * _windFactor` với `_windFactor = 240`
// (GameViewBase.as:237, 2004), trong đó `windRaw` là số nguyên trong gói tin còn
// `Current.wind` đã chia 10 rồi (GameView.as:2534), và `rate` chính là
// `Current.windRate` (GameView.as:2540). Rút gọn: wind * rate * 240.
extern double kWindFactor;

// Hệ số nhân vào vận tốc đầu, 1.0 = đúng như game tự tính cho đường trợ giúp ngắm.
//
// Cần có vì đạn thật KHÔNG lấy vận tốc từ lực: server gửi thẳng VX/VY trong gói
// bắn và client chỉ cộng vào (SimpleBomb.as:142 -> Physics.addSpeedXY). Quan hệ
// giữa lực và VX/VY nằm ở server nên không đọc được; ai thấy đạn bay xa hơn đường
// vẽ thì chỉnh số này lên.
extern double velocityScale;

// Tìm lực để đường đạn đi qua điểm `target` với đúng góc hiện tại — cùng bài toán
// mà `GameViewBase.getPower` giải bằng chia đôi. Trả về 0 nếu không mức lực nào
// trong khoảng 0..2000 tới được.
// `missDistance` (nếu truyền) nhận khoảng cách gần nhất tới đích của mức lực tốt
// nhất — dùng để nói cho người chơi biết hụt bao nhiêu khi không có lời giải.
double solvePower(const AimState &state, const QPointF &target,
                  double *missDistance = nullptr);

// Một cách bắn trúng đích: đặt nòng ở `angleDeg` rồi bắn với `power`.
struct Solution
{
    double angleDeg = 0;
    double power = 0;
    double miss = 0;
};

// Tìm tối đa `count` cách bắn trúng đích, quét góc quanh góc hiện tại. Cung cao và
// cung thấp cùng tới được một chỗ, nên có nhiều lựa chọn để né địa hình.
QVector<Solution> solveAngles(const AimState &state, const QPointF &target,
                              int count = 3, double sweepDeg = 30.0);

}  // namespace trajectory
