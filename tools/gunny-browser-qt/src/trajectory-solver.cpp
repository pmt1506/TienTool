#include "trajectory-solver.h"

#include <QStringList>
#include <QtGlobal>
#include <QtMath>
#include <cmath>

namespace trajectory {

const double kMass = 10.0;
const double kDt = 0.04;
const double kGravityFactor = 70.0;
const double kMaxPower = 2000.0;

// MinGW không định nghĩa M_PI khi biên dịch ở chế độ chuẩn ISO.
const double kPi = 3.141592653589793;

double kWindFactor = 240.0;
double velocityScale = 1.0;  // mã server: vx = force * cos(góc), không hệ số ẩn

namespace {

// Một trục của phy.math.EulerVector: x0 vị trí, x1 vận tốc, x2 gia tốc.
struct Axis
{
    double x0;
    double x1;
    double x2;

    // ComputeOneEulerStep(mass, drag, force, dt) — chép y nguyên thứ tự phép tính
    // của game: gia tốc tính trước, rồi vận tốc, rồi vị trí. Đổi thứ tự là lệch dần
    // theo từng bước.
    void step(double mass, double drag, double force, double dt)
    {
        x2 = (force - drag * x1) / mass;
        x1 += x2 * dt;
        x0 += x1 * dt;
    }
};

}  // namespace

QVector<QPointF> simulate(const AimState &state, double power, int maxSteps)
{
    QVector<QPointF> points;
    if (!state.valid || power <= 0) {
        return points;
    }

    const double rad = state.angleDeg / 180.0 * kPi;
    // Game ép về int trước khi dùng làm vận tốc đầu (getRouteData), giữ nguyên để
    // đường vẽ trùng tới từng bước.
    const double scaled = power * velocityScale;
    const double vx0 = (double)(int)(scaled * std::cos(rad));
    const double vy0 = (double)(int)(scaled * std::sin(rad));

    // Ưu tiên hệ số của viên đạn; thiếu thì dùng bộ hằng số mà GameViewBase
    // hardcode cho đường trợ giúp ngắm (đúng với đạn thường).
    const double mass = state.ballMass > 0 ? state.ballMass : kMass;
    const double weight = state.ballWeight > 0 ? state.ballWeight : kGravityFactor;
    const double windMul = state.ballWind > 0 ? state.ballWind : kWindFactor;
    const double dragMul = state.ballDrag > 0 ? state.ballDrag : 1.0;

    const double drag = state.drag * dragMul;
    const double windForce = state.wind * state.windRate * windMul;
    const double gravityForce = state.gravity * weight * mass;

    Axis ax{state.x, vx0, windForce / mass};
    Axis ay{state.y, vy0, gravityForce / mass};

    points.reserve(maxSteps);
    points.append(QPointF(state.x, state.y));

    for (int i = 0; i < maxSteps; ++i) {
        ax.step(mass, drag, windForce, kDt);
        ay.step(mass, drag, gravityForce, kDt);
        points.append(QPointF(ax.x0, ay.x0));

        // Không có dữ liệu địa hình nên không cắt theo va chạm được; dừng khi đã đi
        // xa hẳn khỏi vùng nhìn thấy. Bản đồ Gunny rộng cỡ 2000-3000 đơn vị.
        if (ay.x0 > state.y + 3000.0 || std::fabs(ax.x0 - state.x) > 5000.0) {
            break;
        }
    }

    return points;
}

double solvePower(const AimState &state, const QPointF &target, double *missDistance)
{
    if (missDistance) {
        *missDistance = 1e9;
    }
    if (!state.valid) {
        return 0.0;
    }

    // Quét thô rồi mài mịn quanh mức tốt nhất. Không chia đôi như game vì hàm
    // khoảng-cách-tới-đích không đơn điệu khi có gió ngược: chia đôi sẽ rơi vào
    // nghiệm sai, còn quét thì luôn ra mức gần nhất trong tầm.
    auto closest = [&](double power) {
        const QVector<QPointF> pts = simulate(state, power);
        double best = 1e18;
        for (const QPointF &p : pts) {
            const double dx = p.x() - target.x();
            const double dy = p.y() - target.y();
            const double d = dx * dx + dy * dy;
            if (d < best) {
                best = d;
            }
        }
        return best;
    };

    double bestPower = 0.0;
    double bestDist = 1e18;
    for (double power = 60.0; power <= kMaxPower; power += 20.0) {
        const double d = closest(power);
        if (d < bestDist) {
            bestDist = d;
            bestPower = power;
        }
    }
    if (bestPower <= 0.0) {
        return 0.0;
    }
    for (double power = qMax(1.0, bestPower - 20.0); power <= qMin(kMaxPower, bestPower + 20.0);
         power += 2.0) {
        const double d = closest(power);
        if (d < bestDist) {
            bestDist = d;
            bestPower = power;
        }
    }

    if (missDistance) {
        *missDistance = std::sqrt(bestDist);
    }
    // Luôn trả về mức lực tốt nhất tìm được, kể cả khi còn hụt xa. Trước đây chỗ
    // này chặn ở 40 đơn vị rồi trả 0, hậu quả là đổi góc xong bấm Tab thì mất sạch
    // đường vẽ — trong khi thứ người chơi cần chính là thấy đường tốt nhất ở góc
    // đó để biết nên xoay tiếp hướng nào. Việc đánh giá gần hay xa để bên gọi lo.
    return bestPower;
}

QVector<Solution> solveAngles(const AimState &state, const QPointF &target, int count,
                              double sweepDeg)
{
    QVector<Solution> found;
    if (!state.valid) {
        return found;
    }

    // Quét từng độ quanh góc hiện tại, mỗi góc giải lực tốt nhất của nó. Góc hiện
    // tại luôn đứng đầu danh sách vì đó là cái người chơi đang thực sự nhắm.
    for (double offset = 0.0; offset <= sweepDeg; offset += 1.0) {
        for (int side = 0; side < (offset == 0.0 ? 1 : 2); ++side) {
            AimState probe = state;
            probe.angleDeg = state.angleDeg + (side == 0 ? offset : -offset);

            double miss = 0.0;
            const double power = solvePower(probe, target, &miss);
            if (power <= 0.0 || miss > 40.0) {
                continue;
            }

            // Bỏ qua góc quá sát cái đã có: ba đường chồng lên nhau thì vô dụng.
            bool tooClose = false;
            for (const Solution &s : found) {
                if (qAbs(s.angleDeg - probe.angleDeg) < 6.0) {
                    tooClose = true;
                    break;
                }
            }
            if (tooClose) {
                continue;
            }

            Solution sol;
            sol.angleDeg = probe.angleDeg;
            sol.power = power;
            sol.miss = miss;
            found.append(sol);
            if (found.size() >= count) {
                return found;
            }
        }
    }
    return found;
}

}  // namespace trajectory

bool AimState::nearestFoe(QPointF *out) const
{
    double best = 1e18;
    bool found = false;
    for (const QPointF &f : foes) {
        const double dx = f.x() - x;
        const double dy = f.y() - y;
        const double d = dx * dx + dy * dy;
        if (d < best) {
            best = d;
            found = true;
            if (out) {
                *out = f;
            }
        }
    }
    return found;
}

AimState AimState::parse(const QString &line)
{
    AimState s;
    // Phần số và phần danh sách địch tách nhau bằng " foes ".
    const int sep = line.indexOf(QLatin1String(" foes "));
    if (sep < 0) {
        return s;
    }
    const QStringList f =
        line.left(sep).split(QLatin1Char(' '), QString::SkipEmptyParts);
    if (f.size() != 15 || f.first() != QLatin1String("aim")) {
        return s;
    }

    bool ok = true;
    bool all = true;
    auto num = [&](int i) {
        const double v = f.at(i).toDouble(&ok);
        all = all && ok;
        return v;
    };

    s.x = num(1);
    s.y = num(2);
    s.angleDeg = num(3);
    s.wind = num(4);
    s.windRate = num(5);
    s.gravity = num(6);
    s.drag = num(7);
    s.anchorX = num(8);
    s.anchorY = num(9);
    s.scale = num(10);
    s.ballMass = num(11);
    s.ballWeight = num(12);
    s.ballWind = num(13);
    s.ballDrag = num(14);

    for (const QString &foe : line.mid(sep + 6).split(QLatin1Char(';'), QString::SkipEmptyParts)) {
        const QStringList xy = foe.split(QLatin1Char(','));
        if (xy.size() != 2) {
            continue;
        }
        bool okx = false;
        bool oky = false;
        const double fx = xy.at(0).toDouble(&okx);
        const double fy = xy.at(1).toDouble(&oky);
        if (okx && oky) {
            s.foes.append(QPointF(fx, fy));
        }
    }

    // scale 0 thì phép đổi toạ độ vô nghĩa; coi như chưa có dữ liệu.
    s.valid = all && s.scale != 0.0;
    return s;
}
